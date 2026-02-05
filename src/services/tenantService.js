import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { createClient } from "redis";

import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import Doctor from "../models/doctorModel.js";

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
export const initRedis = async () => {
  if (redisClient?.isOpen) return redisClient;
  redisClient = createClient({ url: process.env.REDIS_URL || "redis://127.0.0.1:6379" });
  await redisClient.connect();
  return redisClient;
};

const otpKey = (email) => `otp:${normalizeEmail(email)}`;

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
  .select("name specialty image experience education about")
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
        plan: planInfo.plan,
        status: "PENDING_VERIFICATION",
        price: {
          amount: planInfo.amount,
          currency: planInfo.currency
        }
      },
      settings: { isPublic: true }
    }], { session });

    userDoc.tenantId = tenantDoc._id;
    await userDoc.save({ session });

    await session.commitTransaction();

    const otp = generateOtp6();
    const client = await initRedis();
    await client.setEx(otpKey(emailLower), 600, otp);

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

  const client = await initRedis();
  const storedOtp = await client.get(otpKey(emailLower));
  if (!storedOtp || storedOtp !== String(otp)) throw new Error("Invalid/Expired code.");

  user.isVerified = true;
  await user.save();
  await client.del(otpKey(emailLower));

  return { user };
};

export const resendOTP = async (email) => {
  const emailLower = normalizeEmail(email);
  const otp = generateOtp6();
  const client = await initRedis();
  await client.setEx(otpKey(emailLower), 600, otp);

  await getTransporter().sendMail({
    from: `"Medicare Systems" <${process.env.EMAIL_USER}>`,
    to: emailLower,
    subject: "Your New Verification Code",
    html: `<h1>${otp}</h1>`,
  });
};

export const getClinicStats = async (tenantId) => {
  const tId = new mongoose.Types.ObjectId(tenantId);
  const [totalDoctors, patientAgg] = await Promise.all([
    Doctor.countDocuments({ tenantId: tId, isDeleted: { $ne: true } }),
    Doctor.aggregate([
      { $match: { tenantId: tId, isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: "$patientsCount" } } },
    ]),
  ]);

  return { totalDoctors, totalPatients: patientAgg[0]?.total || 0 };
};

export const getTenantProfile = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new Error("Clinic profile does not exist.");
  return tenant;
};