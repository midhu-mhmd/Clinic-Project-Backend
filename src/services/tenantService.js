import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { createClient } from "redis";

import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import Doctor from "../models/doctorModel.js";

/* =========================================================
   Redis: safe singleton init (no parallel connects)
========================================================= */
let redisClient;
let redisInitPromise = null;

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

export const getRedisClient = () => redisClient;

export const initRedis = async () => {
  if (redisClient?.isOpen) return redisClient;
  if (redisInitPromise) return redisInitPromise;

  redisInitPromise = (async () => {
    redisClient = createClient({
      url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
    });

    redisClient.on("error", (err) => console.error("❌ Redis Error:", err));
    redisClient.on("connect", () => console.log("🟡 Redis Connecting..."));
    redisClient.on("ready", () => console.log("✅ Redis Ready"));
    redisClient.on("reconnecting", () => console.log("♻️ Redis Reconnecting..."));
    redisClient.on("end", () => console.log("🔴 Redis Closed"));

    await redisClient.connect();
    return redisClient;
  })();

  try {
    return await redisInitPromise;
  } finally {
    // allow retry if connect fails
    redisInitPromise = null;
  }
};

const setOtpInRedis = async (emailLower, otp) => {
  const client = await initRedis();
  // 10 minutes
  await client.setEx(`otp:${emailLower}`, 600, String(otp));
};

const getOtpFromRedis = async (emailLower) => {
  const client = await initRedis();
  return client.get(`otp:${emailLower}`);
};

const deleteOtpFromRedis = async (emailLower) => {
  const client = await initRedis();
  await client.del(`otp:${emailLower}`);
};

/* =========================================================
   Email: cached transporter (performance + stability)
========================================================= */
let transporter;
const getTransporter = () => {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("⚠️ EMAIL_USER/EMAIL_PASS missing. Mail will fail.");
  }

  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // optional: verify once (non-blocking)
  transporter.verify().catch((e) => {
    console.error("❌ SMTP verify failed:", e.message);
  });

  return transporter;
};

/* =========================================================
   Helpers
========================================================= */
const generateOtp6 = () => String(Math.floor(100000 + Math.random() * 900000));

const signToken = (user) => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing in env.");

  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      tenantId: user.tenantId ? String(user.tenantId) : null,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const safeObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const pickSubscriptionPlan = (clinicData) => {
  // If you want to choose plan at registration:
  // clinicData?.subscription?.plan or clinicData?.plan
  const planRaw =
    clinicData?.subscription?.plan || clinicData?.plan || "PRO";

  const plan = String(planRaw).toUpperCase();

  // matches your updated Tenant model enum
  const allowed = new Set(["PRO", "ENTERPRISE", "PROFESSIONAL"]);
  if (!allowed.has(plan)) return "PRO";

  return plan;
};

/* =========================================================
   ✅ REGISTER CLINIC TRANSACTION (atomic)
   - creates CLINIC_ADMIN + Tenant
   - stores OTP in redis
   - sends email (best-effort)
   - subscription: PRO + PENDING_VERIFICATION by default (payment gate)
========================================================= */
export const registerClinicTransaction = async (ownerData, clinicData) => {
  const session = await mongoose.startSession();

  const emailLower = normalizeEmail(ownerData?.email);
  if (!emailLower) throw new Error("Owner email is required.");
  if (!ownerData?.password) throw new Error("Owner password is required.");
  if (!clinicData?.registrationId) throw new Error("Clinic registrationId is required.");
  if (!clinicData?.name) throw new Error("Clinic name is required.");
  if (!clinicData?.address) throw new Error("Clinic address is required.");

  const plan = pickSubscriptionPlan(clinicData);

  // IMPORTANT: Payment gate default
  // (Only after payment you set status = ACTIVE and store razorpay ids)
  const subscription = {
    plan,
    status: "PENDING_VERIFICATION",
  };

  let createdUser;
  let createdTenant;

  try {
    await session.withTransaction(async () => {
      // 1) ensure unique user
      const existingUser = await User.findOne({ email: emailLower })
        .session(session)
        .lean();

      if (existingUser) throw new Error("Email already registered.");

      // 2) ensure unique clinic registrationId
      const existingClinic = await Tenant.findOne({
        registrationId: String(clinicData.registrationId).trim(),
      })
        .session(session)
        .lean();

      if (existingClinic) throw new Error("This Clinic Registration ID is already in use.");

      // 3) hash password
      const hashedPassword = await bcrypt.hash(String(ownerData.password), 12);

      // 4) create user first
      createdUser = await User.create(
        [
          {
            ...ownerData,
            email: emailLower,
            password: hashedPassword,
            role: "CLINIC_ADMIN",
            isVerified: false,
          },
        ],
        { session }
      );

      const userDoc = createdUser[0];

      // 5) create tenant
      createdTenant = await Tenant.create(
        [
          {
            ...clinicData,
            ownerId: userDoc._id,
            settings: {
              ...(clinicData.settings || {}),
              isPublic: true,
            },
            subscription,
          },
        ],
        { session }
      );

      const tenantDoc = createdTenant[0];

      // 6) attach tenantId to user
      userDoc.tenantId = tenantDoc._id;
      await userDoc.save({ session });
    });

    // Transaction committed ✅
    const user = Array.isArray(createdUser) ? createdUser[0] : createdUser;
    const tenant = Array.isArray(createdTenant) ? createdTenant[0] : createdTenant;

    // OTP + email can be outside transaction (best-effort)
    const otp = generateOtp6();
    await setOtpInRedis(emailLower, otp);

    try {
      await getTransporter().sendMail({
        from: `"Medicare Systems" <${process.env.EMAIL_USER}>`,
        to: emailLower,
        subject: "Action Required: Verify Clinic Enrollment",
        html: `
          <div style="font-family:sans-serif; text-align:center; padding:20px; border:1px solid #eee;">
            <h2 style="color:#8DAA9D;">Welcome to Sovereign</h2>
            <p>Your institutional verification code is:</p>
            <h1 style="letter-spacing:5px; font-size:32px;">${otp}</h1>
            <p>This code expires in 10 minutes.</p>
          </div>
        `,
      });
    } catch (mailErr) {
      console.error("📧 Mail send failed (register clinic):", mailErr.message);
      // don’t fail registration for mail issues
    }

    return { user, tenant };
  } catch (error) {
    console.error("Registration Service Error:", error.message);
    throw error;
  } finally {
    session.endSession();
  }
};

/* =========================================================
   ✅ VERIFY CLINIC ADMIN EMAIL
========================================================= */
export const verifyUserEmail = async (email, otp) => {
  const emailLower = normalizeEmail(email);
  if (!emailLower) throw new Error("Email is required.");
  if (!otp) throw new Error("OTP is required.");

  const user = await User.findOne({ email: emailLower });
  if (!user) throw new Error("Credentials not found.");

  const storedOtp = await getOtpFromRedis(emailLower);
  if (!storedOtp || String(storedOtp).trim() !== String(otp).trim()) {
    throw new Error("Invalid or expired security code.");
  }

  if (!user.isVerified) {
    user.isVerified = true;
    await user.save();
  }

  await deleteOtpFromRedis(emailLower);

  const token = signToken(user);
  return { token, user };
};

/* =========================================================
   ✅ RESEND OTP
========================================================= */
export const resendOTP = async (email) => {
  const emailLower = normalizeEmail(email);
  if (!emailLower) throw new Error("Email is required.");

  const otp = generateOtp6();
  await setOtpInRedis(emailLower, otp);

  try {
    await getTransporter().sendMail({
      from: `"Medicare Systems" <${process.env.EMAIL_USER}>`,
      to: emailLower,
      subject: "New Verification Code",
      html: `<p>Your new security code is: <b>${otp}</b> (expires in 10 minutes)</p>`,
    });
  } catch (mailErr) {
    console.error("📧 Mail send failed (resend):", mailErr.message);
  }
};

/* =========================================================
   ✅ CLINIC STATS (fast)
========================================================= */
export const getClinicStats = async (tenantId) => {
  if (!safeObjectId(tenantId)) throw new Error("Invalid Clinic Reference.");

  const tId = new mongoose.Types.ObjectId(tenantId);

  const [totalDoctors, patientAgg] = await Promise.all([
    Doctor.countDocuments({ tenantId: tId, isDeleted: { $ne: true } }),
    Doctor.aggregate([
      { $match: { tenantId: tId, isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: "$patientsCount" } } },
    ]),
  ]);

  return {
    totalDoctors,
    totalPatients: patientAgg?.[0]?.total || 0,
    todayAppointments: 0,
    waitTime: 15,
  };
};

/* =========================================================
   ✅ PUBLIC CLINICS (scalable)
   - supports pagination + search
   - still works if controller calls without args
========================================================= */
export const getAllPublicClinics = async (options = {}) => {
  const {
    page = 1,
    limit = 50,
    search = "",
    // if you really want "all", pass { limit: 10000 }
  } = options;

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const q = {
    "settings.isPublic": true,
  };

  const s = String(search || "").trim();
  if (s) {
    q.$or = [
      { name: { $regex: s, $options: "i" } },
      { registrationId: { $regex: s, $options: "i" } },
      { slug: { $regex: s, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Tenant.find(q)
      .select("name slug registrationId address image tags description settings subscription createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Tenant.countDocuments(q),
  ]);

  return {
    page: safePage,
    limit: safeLimit,
    total,
    data: items,
  };
};

/* =========================================================
   ✅ TENANT PROFILE
========================================================= */
export const getTenantProfile = async (tenantId) => {
  if (!safeObjectId(tenantId)) throw new Error("Invalid Clinic Reference.");

  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new Error("Clinic profile does not exist.");

  return tenant;
};

/* =========================================================
   ✅ UPDATE TENANT SETTINGS (safe flatten)
========================================================= */
export const updateTenantSettings = async (tenantId, updateData = {}) => {
  if (!safeObjectId(tenantId)) throw new Error("Invalid Clinic Reference.");

  const finalUpdate = { ...updateData };

  if (updateData.settings && typeof updateData.settings === "object") {
    for (const key of Object.keys(updateData.settings)) {
      finalUpdate[`settings.${key}`] = updateData.settings[key];
    }
    delete finalUpdate.settings;
  }

  const updated = await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: finalUpdate },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) throw new Error("Clinic not found.");
  return updated;
};

/* =========================================================
   ✅ UPDATE TENANT IMAGE
========================================================= */
export const updateTenantImageService = async (tenantId, imageUrl) => {
  if (!safeObjectId(tenantId)) throw new Error("Invalid Clinic Reference.");

  const updated = await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: { image: imageUrl } },
    { new: true }
  ).lean();

  if (!updated) throw new Error("Clinic not found.");
  return updated;
};

/* =========================================================
   ✅ PUBLIC DOCTORS
========================================================= */
export const getPublicDoctorsService = async (tenantId) => {
  if (!safeObjectId(tenantId)) throw new Error("Invalid Clinic Reference.");

  return Doctor.find({
    tenantId,
    isActive: true,
    isDeleted: { $ne: true },
    status: { $in: ["On Duty", "On Break"] },
  })
    .select(
      "name specialization education experience availability image rating status patientsCount"
    )
    .lean();
};
