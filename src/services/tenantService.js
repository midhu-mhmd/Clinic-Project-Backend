import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { createClient } from "redis";

import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import Doctor from "../models/doctorModel.js";

/* =========================================================
   Small Utils
========================================================= */
const normalizeEmail = (email = "") => String(email).trim().toLowerCase();
const normalizeRegId = (id = "") => String(id).trim().toUpperCase();

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const requireEnv = (key) => {
  if (!process.env[key]) throw new Error(`${key} missing in env.`);
};

const generateOtp6 = () => String(Math.floor(100000 + Math.random() * 900000));

const signToken = (user) => {
  requireEnv("JWT_SECRET");

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

/**
 * ✅ Plan picking (matches your Tenant model enum)
 */
const pickSubscriptionPlan = (clinicData) => {
  const raw = clinicData?.subscription?.plan || clinicData?.plan || "PRO";
  const plan = String(raw).toUpperCase();
  const allowed = new Set(["PRO", "ENTERPRISE", "PROFESSIONAL"]);
  return allowed.has(plan) ? plan : "PRO";
};

/**
 * ✅ Prevent mass assignment: only pick allowed fields
 */
const pickOwnerFields = (ownerData = {}) => ({
  name: String(ownerData.name || "").trim(),
  email: normalizeEmail(ownerData.email),
  password: String(ownerData.password || ""),
  phone: ownerData.phone ? String(ownerData.phone).trim() : undefined,
});

const pickClinicFields = (clinicData = {}) => ({
  name: String(clinicData.name || "").trim(),
  registrationId: normalizeRegId(clinicData.registrationId),
  address: String(clinicData.address || "").trim(),
  image: clinicData.image ? String(clinicData.image).trim() : undefined,
  tags: Array.isArray(clinicData.tags) ? clinicData.tags : undefined,
  description: clinicData.description ? String(clinicData.description).trim() : undefined,
  settings: clinicData.settings && typeof clinicData.settings === "object"
    ? { ...clinicData.settings }
    : undefined,
});

/* =========================================================
   Redis: safe singleton init (no parallel connects)
========================================================= */
let redisClient;
let redisInitPromise = null;

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
    redisInitPromise = null; // allow retry if failed
  }
};

export const closeRedis = async () => {
  try {
    if (redisClient?.isOpen) await redisClient.quit();
  } catch (e) {
    console.error("Redis quit failed:", e.message);
  }
};

const setOtpInRedis = async (emailLower, otp) => {
  const client = await initRedis();
  await client.setEx(`otp:${emailLower}`, 600, String(otp)); // 10 mins
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

  transporter.verify().catch((e) => {
    console.error("❌ SMTP verify failed:", e.message);
  });

  return transporter;
};

/* =========================================================
   ✅ REGISTER CLINIC TRANSACTION (atomic)
   - creates CLINIC_ADMIN + Tenant
   - stores OTP in redis
   - sends email (best-effort)
   - subscription status = PENDING_VERIFICATION (payment gate)
========================================================= */
export const registerClinicTransaction = async (ownerData, clinicData) => {
  const owner = pickOwnerFields(ownerData);
  const clinic = pickClinicFields(clinicData);

  if (!owner.email) throw new Error("Owner email is required.");
  if (!owner.password) throw new Error("Owner password is required.");
  if (!clinic.registrationId) throw new Error("Clinic registrationId is required.");
  if (!clinic.name) throw new Error("Clinic name is required.");
  if (!clinic.address) throw new Error("Clinic address is required.");

  const plan = pickSubscriptionPlan(clinicData);

  // ✅ Payment gate default
  const subscription = {
    plan,
    status: "PENDING_VERIFICATION",
  };

  const session = await mongoose.startSession();

  try {
    // stronger txn guarantees
    session.startTransaction({
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });

    // 1) ensure unique user email
    const existingUser = await User.findOne({ email: owner.email })
      .session(session)
      .lean();

    if (existingUser) throw new Error("Email already registered.");

    // 2) ensure unique clinic registrationId
    const existingClinic = await Tenant.findOne({ registrationId: clinic.registrationId })
      .session(session)
      .lean();

    if (existingClinic) throw new Error("This Clinic Registration ID is already in use.");

    // 3) hash password
    const hashedPassword = await bcrypt.hash(owner.password, 12);

    // 4) create user
    const userDoc = await User.create(
      [
        {
          name: owner.name,
          email: owner.email,
          password: hashedPassword,
          phone: owner.phone,
          role: "CLINIC_ADMIN",
          isVerified: false,
        },
      ],
      { session }
    ).then((arr) => arr[0]);

    // 5) create tenant
    const tenantDoc = await Tenant.create(
      [
        {
          name: clinic.name,
          registrationId: clinic.registrationId,
          address: clinic.address,
          image: clinic.image,
          tags: clinic.tags,
          description: clinic.description,
          ownerId: userDoc._id,
          settings: {
            ...(clinic.settings || {}),
            isPublic: true,
          },
          subscription,
        },
      ],
      { session }
    ).then((arr) => arr[0]);

    // 6) attach tenantId to user
    userDoc.tenantId = tenantDoc._id;
    await userDoc.save({ session });

    await session.commitTransaction();
    session.endSession();

    // ✅ OTP + email outside transaction (best-effort)
    const otp = generateOtp6();
    await setOtpInRedis(owner.email, otp);

    try {
      await getTransporter().sendMail({
        from: `"Medicare Systems" <${process.env.EMAIL_USER}>`,
        to: owner.email,
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
    }

    return { user: userDoc, tenant: tenantDoc };
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch {}
    session.endSession();

    // nicer duplicate key errors
    if (String(error?.message || "").includes("E11000")) {
      throw new Error("Duplicate record detected (email/registrationId already exists).");
    }

    console.error("Registration Service Error:", error.message);
    throw error;
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
  if (!isValidObjectId(tenantId)) throw new Error("Invalid Clinic Reference.");

  const tId = new mongoose.Types.ObjectId(tenantId);

  const [totalDoctors, patientAgg] = await Promise.all([
    Doctor.countDocuments({ tenantId: tId, isDeleted: { $ne: true } }),
    Doctor.aggregate([
      { $match: { tenantId: tId, isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: "$patientsCount" } } },
    ]).option({ maxTimeMS: 4000 }),
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
   - pagination + optional search
   - projection + lean + maxTimeMS
========================================================= */
export const getAllPublicClinics = async (options = {}) => {
  const page = Math.max(Number(options.page) || 1, 1);
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const skip = (page - 1) * limit;

  const q = { "settings.isPublic": true };
  const search = String(options.search || "").trim();

  /**
   * NOTE:
   * Regex search is OK for 5k clinics.
   * For 50k+ clinics, move to:
   * - MongoDB Atlas Search OR
   * - text index + $text query
   */
  if (search) {
    q.$or = [
      { name: { $regex: search, $options: "i" } },
      { registrationId: { $regex: search.toUpperCase(), $options: "i" } },
      { slug: { $regex: search.toLowerCase(), $options: "i" } },
    ];
  }

  const projection =
    "name slug registrationId address image tags description settings subscription createdAt";

  const [items, total] = await Promise.all([
    Tenant.find(q)
      .select(projection)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .maxTimeMS(4000),
    Tenant.countDocuments(q).maxTimeMS(4000),
  ]);

  return {
    page,
    limit,
    total,
    data: items,
  };
};

/* =========================================================
   ✅ TENANT PROFILE
========================================================= */
export const getTenantProfile = async (tenantId) => {
  if (!isValidObjectId(tenantId)) throw new Error("Invalid Clinic Reference.");

  const tenant = await Tenant.findById(tenantId).lean().maxTimeMS(4000);
  if (!tenant) throw new Error("Clinic profile does not exist.");

  return tenant;
};

/* =========================================================
   ✅ UPDATE TENANT SETTINGS (safe flatten)
========================================================= */
export const updateTenantSettings = async (tenantId, updateData = {}) => {
  if (!isValidObjectId(tenantId)) throw new Error("Invalid Clinic Reference.");

  const finalUpdate = { ...updateData };

  if (updateData.settings && typeof updateData.settings === "object") {
    for (const key of Object.keys(updateData.settings)) {
      finalUpdate[`settings.${key}`] = updateData.settings[key];
    }
    delete finalUpdate.settings;
  }

  // security: prevent subscription overwrite here (keep it for payment flow)
  delete finalUpdate.subscription;
  delete finalUpdate.ownerId;

  const updated = await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: finalUpdate },
    { new: true, runValidators: true }
  )
    .lean()
    .maxTimeMS(4000);

  if (!updated) throw new Error("Clinic not found.");
  return updated;
};

/* =========================================================
   ✅ UPDATE TENANT IMAGE
========================================================= */
export const updateTenantImageService = async (tenantId, imageUrl) => {
  if (!isValidObjectId(tenantId)) throw new Error("Invalid Clinic Reference.");

  const updated = await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: { image: String(imageUrl || "") } },
    { new: true }
  )
    .lean()
    .maxTimeMS(4000);

  if (!updated) throw new Error("Clinic not found.");
  return updated;
};

/* =========================================================
   ✅ PUBLIC DOCTORS (fast)
========================================================= */
export const getPublicDoctorsService = async (tenantId) => {
  if (!isValidObjectId(tenantId)) throw new Error("Invalid Clinic Reference.");

  return Doctor.find({
    tenantId,
    isActive: true,
    isDeleted: { $ne: true },
    status: { $in: ["On Duty", "On Break"] },
  })
    .select("name specialization education experience availability image rating status patientsCount")
    .lean()
    .maxTimeMS(4000);
};
