import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { createClient } from "redis";

import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import Doctor from "../models/doctorModel.js";
import Appointment from "../models/appointmentModel.js";
import TempRegistration from "../models/tempRegistrationModel.js";
import OTP from "../models/otpModel.js";

/* =========================================================
   Subscription Configuration (Server-Side Source of Truth)
   ========================================================= */
const SUBSCRIPTION_CONFIG = {
  PRO: { amount: 499, currency: "INR" },
  ENTERPRISE: { amount: 999, currency: "INR" },
  PROFESSIONAL: { amount: 2499, currency: "INR" },
};

/* =========================================================
   Small Utils
   ========================================================= */
const normalizeEmail = (email = "") => String(email).trim().toLowerCase();
const normalizeRegId = (id = "") => String(id).trim().toUpperCase();
const normalizeStr = (v = "") => String(v).trim();
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));
const requireEnv = (key) => {
  if (!process.env[key]) throw new Error(`${key} missing in env.`);
};
const generateOtp6 = () => String(Math.floor(100000 + Math.random() * 900000));

const getPlanDetails = (planName) => {
  const plan = String(planName || "PRO").toUpperCase().trim();
  const details = SUBSCRIPTION_CONFIG[plan] || SUBSCRIPTION_CONFIG.PRO;
  return { plan, ...details };
};

/* =========================================================
   Tokens
   ========================================================= */
export const signToken = (user) => {
  requireEnv("JWT_SECRET");
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      tenantId: user.tenantId ? String(user.tenantId) : null,
      purpose: "AUTH",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

export const signPaymentToken = ({ tenantId, email, role = "CLINIC_ADMIN" }) => {
  requireEnv("JWT_SECRET");
  return jwt.sign(
    {
      tenantId: String(tenantId),
      email: normalizeEmail(email),
      role,
      purpose: "PAYMENT",
    },
    process.env.JWT_SECRET,
    { expiresIn: "30m" }
  );
};

/* =========================================================
   Redis & Email (Singleton Logic)
   ========================================================= */
let redisClient;
let redisInitPromise = null;

export const initRedis = async () => {
  if (redisClient?.isOpen) return redisClient;
  if (redisInitPromise) return redisInitPromise;

  redisInitPromise = (async () => {
    try {
      redisClient = createClient({
        url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => (retries > 3 ? new Error("Limit reached") : 500),
        },
      });
      redisClient.on("error", (err) => console.log("❌ Redis error:", err.message));
      await redisClient.connect();
      return redisClient;
    } catch (err) {
      console.error("❌ Redis init failed:", err.message);
      redisClient = null;
      return null;
    } finally {
      redisInitPromise = null;
    }
  })();

  return redisInitPromise;
};

const setOtp = async (email, otp, ttlSeconds = 600) => {
  const e = normalizeEmail(email);
  const key = `otp:${e}`;

  try {
    const client = await initRedis();
    if (client) {
      await client.setEx(key, ttlSeconds, String(otp));
      return;
    }
  } catch (err) {
    console.error("Redis setOtp fallback to Mongo:", err.message);
  }

  // MongoDB Fallback
  await OTP.findOneAndUpdate(
    { email: e },
    { otp: String(otp), createdAt: new Date() },
    { upsert: true }
  );
};

const getOtp = async (email) => {
  const e = normalizeEmail(email);
  const key = `otp:${e}`;

  try {
    const client = await initRedis();
    if (client) {
      const val = await client.get(key);
      if (val) return val;
    }
  } catch (err) {
    console.error("Redis getOtp fallback to Mongo:", err.message);
  }

  // MongoDB Fallback
  const doc = await OTP.findOne({ email: e });
  return doc ? doc.otp : null;
};

const delOtp = async (email) => {
  const e = normalizeEmail(email);
  const key = `otp:${e}`;

  try {
    const client = await initRedis();
    if (client) await client.del(key);
  } catch (err) {
    console.error("Redis delOtp error:", err.message);
  }

  await OTP.deleteOne({ email: e });
};

let transporter;
const getTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  return transporter;
};

/* =========================================================
   ✅ GET ALL PUBLIC CLINICS (The missing function)
   ========================================================= */
export const getAllPublicClinics = async ({ page = 1, limit = 20, search = "" }) => {
  const skip = (page - 1) * limit;
  const query = { "settings.isPublic": { $ne: false } };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { registrationId: { $regex: search, $options: "i" } },
      { tags: { $in: [new RegExp(search, "i")] } }
    ];
  }

  const [data, total] = await Promise.all([
    Tenant.find(query)
      .select("name registrationId address image tags description settings subscription createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Tenant.countDocuments(query),
  ]);

  return { data, total, page, limit };
};

/* =========================================================
   ✅ GET PUBLIC DOCTORS (Missing function)
   ========================================================= */
export const getPublicDoctorsService = async (clinicId) => {
  if (!isValidObjectId(clinicId)) throw new Error("Invalid Clinic ID.");

  return await Doctor.find({
    tenantId: clinicId,
    isDeleted: false
  })
    .select("name specialization image experience education about consultationFee")
    .lean();
};

/* =========================================================
   ✅ REGISTER CLINIC
   ========================================================= */
export const registerClinicTransaction = async (ownerData, clinicData) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const emailLower = normalizeEmail(ownerData.email);
    const existingUser = await User.findOne({ email: emailLower }).session(session);
    if (existingUser) throw new Error("Email already registered.");

    const regId = normalizeRegId(clinicData.registrationId);
    const existingClinic = await Tenant.findOne({ registrationId: regId }).session(session);
    if (existingClinic) throw new Error("Clinic Registration ID already in use.");

    const hashedPassword = await bcrypt.hash(ownerData.password, 12);
    const planInfo = getPlanDetails(clinicData.subscription?.plan || clinicData.plan);

    const [userDoc] = await User.create([{
      name: normalizeStr(ownerData.name),
      email: emailLower,
      password: hashedPassword,
      role: "CLINIC_ADMIN",
      isVerified: false,
    }], { session });

    const [tenantDoc] = await Tenant.create([{
      name: normalizeStr(clinicData.name),
      registrationId: regId,
      address: normalizeStr(clinicData.address),
      ownerId: userDoc._id,
      subscription: {
        plan: "FREE",
        status: "ACTIVE",
      },
      settings: { isPublic: true }
    }], { session });

    userDoc.tenantId = tenantDoc._id;
    await userDoc.save({ session });

    await session.commitTransaction();

    const otp = generateOtp6();
    await setOtp(emailLower, otp, 600);

    await getTransporter().sendMail({
      from: `"Medicare Systems" <${process.env.EMAIL_USER}>`,
      to: emailLower,
      subject: "Verify Clinic Enrollment",
      html: `<h1>${otp}</h1><p>Code expires in 10 minutes.</p>`,
    }).catch(e => console.error("Mail Error:", e.message));

    return { user: userDoc, tenant: tenantDoc };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/* =========================================================
   ✅ OTHER SERVICES
   ========================================================= */

export const updateTenantSettings = async (tenantId, updateData) => {
  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: updateData },
    { new: true, runValidators: true }
  ).lean();
  if (!tenant) throw new Error("Tenant not found.");
  return tenant;
};

export const updateTenantImageService = async (tenantId, imageUrl) => {
  return await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: { image: imageUrl } },
    { new: true }
  ).lean();
};

export const activateTenantSubscription = async ({
  tenantId,
  razorpayOrderId,
  razorpayPaymentId,
  plan,
}) => {
  if (!isValidObjectId(tenantId)) throw new Error("Invalid Clinic Reference.");

  const update = {
    "subscription.status": "ACTIVE",
    "subscription.razorpayOrderId": normalizeStr(razorpayOrderId),
    "subscription.razorpayPaymentId": normalizeStr(razorpayPaymentId),
    "subscription.paymentMethodStatus": "ON_FILE",
  };

  if (plan) {
    const planInfo = getPlanDetails(plan);
    update["subscription.plan"] = planInfo.plan;
    update["subscription.price.amount"] = planInfo.amount;
    update["subscription.price.currency"] = planInfo.currency;
  }

  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if (!tenant) throw new Error("Tenant not found.");
  return tenant;
};

export const verifyUserEmail = async (email, otp) => {
  const emailLower = normalizeEmail(email);
  const user = await User.findOne({ email: emailLower });
  if (!user) throw new Error("Credentials not found.");

  const storedOtp = await getOtp(emailLower);
  if (!storedOtp || storedOtp !== String(otp)) throw new Error("Invalid/Expired code.");

  user.isVerified = true;
  await user.save();
  await delOtp(emailLower);

  return { user };
};

export const resendOTP = async (email) => {
  const emailLower = normalizeEmail(email);
  const otp = generateOtp6();
  await setOtp(emailLower, otp, 600);

  await getTransporter().sendMail({
    from: `"Medicare Systems" <${process.env.EMAIL_USER}>`,
    to: emailLower,
    subject: "Your New Verification Code",
    html: `<h1>${otp}</h1>`,
  });
};

export const getClinicStats = async (tenantId) => {
  const tId = new mongoose.Types.ObjectId(tenantId);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    totalDoctors,
    uniquePatients,
    todayAppointments,
    totalRevenue
  ] = await Promise.all([
    Doctor.countDocuments({ tenantId: tId, isDeleted: { $ne: true } }),
    Appointment.distinct("patientId", { tenantId: tId }),
    Appointment.countDocuments({
      tenantId: tId,
      dateTime: { $gte: todayStart, $lte: todayEnd }
    }),
    Appointment.aggregate([
      { $match: { tenantId: tId, status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$consultationFee" } } }
    ])
  ]);

  return {
    totalDoctors,
    totalPatients: uniquePatients.length,
    todayAppointments,
    totalRevenue: totalRevenue[0]?.total || 0,
    waitTime: 15 // Placeholder for now or calculate if logic exists
  };
};

export const getTenantProfile = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error("Clinic profile does not exist.");
  return tenant;
};

/* =========================================================
   ✅ SUBSCRIPTION MANAGEMENT (Admin/Super-Admin)
   ========================================================= */

export const updateSubscriptionPlan = async (tenantId, newPlan, adminId) => {
  const planInfo = getPlanDetails(newPlan);
  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    {
      $set: {
        "subscription.plan": planInfo.plan,
        "subscription.price.amount": planInfo.amount,
        "subscription.price.currency": planInfo.currency,
      },
      $push: {
        auditLogs: {
          action: "PLAN_UPGRADE_DOWNGRADE",
          performedBy: adminId,
          details: `Plan changed to ${planInfo.plan}`,
        }
      }
    },
    { new: true }
  ).lean();
  if (!tenant) throw new Error("Tenant not found.");
  return tenant;
};

export const cancelSubscription = async (tenantId, immediate, adminId) => {
  const update = immediate
    ? { "subscription.status": "CANCELED", "subscription.cancelAtPeriodEnd": false }
    : { "subscription.cancelAtPeriodEnd": true };

  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    {
      $set: update,
      $push: {
        auditLogs: {
          action: "SUBSCRIPTION_CANCEL",
          performedBy: adminId,
          details: immediate ? "Canceled immediately" : "Canceled at period end",
        }
      }
    },
    { new: true }
  ).lean();
  if (!tenant) throw new Error("Tenant not found.");
  return tenant;
};

export const pauseSubscription = async (tenantId, adminId) => {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error("Tenant not found.");

  const isPaused = !tenant.subscription.isPaused;
  tenant.subscription.isPaused = isPaused;
  tenant.auditLogs.push({
    action: "SUBSCRIPTION_PAUSE",
    performedBy: adminId,
    details: isPaused ? "Subscription paused" : "Subscription resumed",
  });

  await tenant.save();
  return tenant;
};

export const applyCoupon = async (tenantId, couponCode, adminId) => {
  // Placeholder: Real coupon logic would involve checking a Coupon model
  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    {
      $push: {
        auditLogs: {
          action: "COUPON_APPLIED",
          performedBy: adminId,
          details: `Manual coupon applied: ${couponCode}`,
        }
      }
    },
    { new: true }
  ).lean();
  return tenant;
};

export const updateBillingCycle = async (tenantId, newCycle, adminId) => {
  if (!["MONTHLY", "ANNUAL"].includes(newCycle.toUpperCase())) {
    throw new Error("Invalid billing cycle.");
  }

  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    {
      $set: { "subscription.billingCycle": newCycle.toUpperCase() },
      $push: {
        auditLogs: {
          action: "BILLING_CYCLE_CHANGE",
          performedBy: adminId,
          details: `Changed to ${newCycle}`,
        }
      }
    },
    { new: true }
  ).lean();
  return tenant;
};

export const recordManualOverride = async (tenantId, details, adminId) => {
  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    {
      $push: {
        auditLogs: {
          action: "MANUAL_OVERRIDE",
          performedBy: adminId,
          details: details,
        }
      }
    },
    { new: true }
  ).lean();
  return tenant;
};
