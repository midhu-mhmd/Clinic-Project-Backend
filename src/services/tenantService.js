import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import Doctor from "../models/doctorModel.js";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import { createClient } from "redis";
import mongoose from "mongoose";

// =====================
// REDIS OPTIMIZATION
// =====================
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
});

redisClient.on("error", (err) => console.error("❌ Redis Client Error:", err));

const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) await redisClient.connect();
  } catch (err) {
    console.error("Critical: Could not connect to Redis", err);
  }
};
connectRedis();

// =====================
// EMAIL CONFIGURATION
// =====================
const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ==========================================
// AUTH & CLINIC REGISTRATION
// ==========================================

/**
 * @desc Atomic Transaction to register Clinic and its Admin Owner
 */
export const registerClinicTransaction = async (ownerData, clinicData) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const emailLower = ownerData.email.toLowerCase().trim();
    
    const existingUser = await User.findOne({ email: emailLower }).session(session);
    if (existingUser) throw new Error("This email is already registered.");

    const hashedPassword = await bcrypt.hash(ownerData.password, 12);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 1. Create User
    const [user] = await User.create([{
      ...ownerData,
      email: emailLower,
      password: hashedPassword,
      role: "CLINIC_ADMIN",
      isVerified: false,
    }], { session });

    // 2. Create Tenant
    const [tenant] = await Tenant.create([{
      ...clinicData,
      ownerId: user._id,
      settings: { isPublic: true },
      subscription: { plan: "FREE", status: "ACTIVE" },
    }], { session });

    // 3. Link back
    user.tenantId = tenant._id;
    await user.save({ session });

    // 4. Verification Setup
    await redisClient.setEx(`otp:${emailLower}`, 600, otp);

    await transporter.sendMail({
      from: `"Medicare Systems" <${process.env.EMAIL_USER}>`,
      to: emailLower,
      subject: "Action Required: Verify Clinic Enrollment",
      html: `<div style="font-family:sans-serif; color: #333; text-align: center; border: 1px solid #eee; padding: 20px;">
                <h2 style="color: #8DAA9D;">Welcome to Sovereign</h2>
                <p>Your institutional verification code is:</p>
                <h1 style="letter-spacing: 10px; font-size: 32px; color: #1a1a1a;">${otp}</h1>
                <p style="color: #666;">This code expires in 10 minutes.</p>
             </div>`,
    });

    await session.commitTransaction();
    return { user, tenant };

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * @desc Verify OTP and update status
 */
export const verifyUserEmail = async (email, otp) => {
  const emailLower = email.toLowerCase().trim();
  const user = await User.findOne({ email: emailLower });
  if (!user) throw new Error("Credentials not found.");

  const storedOtp = await redisClient.get(`otp:${emailLower}`);
  if (!storedOtp || storedOtp !== String(otp)) throw new Error("Invalid or expired security code.");

  if (!user.isVerified) {
    await User.updateOne({ _id: user._id }, { $set: { isVerified: true } });
  }

  await redisClient.del(`otp:${emailLower}`);

  const token = jwt.sign(
    { id: user._id, role: user.role, tenantId: user.tenantId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return { token, user };
};

/**
 * @desc Re-trigger OTP dispatch
 */
export const resendOTP = async (email) => {
  const emailLower = email.toLowerCase().trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  await redisClient.setEx(`otp:${emailLower}`, 600, otp);

  await transporter.sendMail({
    from: `"Medicare Systems" <${process.env.EMAIL_USER}>`,
    to: emailLower,
    subject: "New Verification Code",
    html: `<p>Your code is: <b>${otp}</b></p>`,
  });
};

// ==========================================
// DASHBOARD & ANALYTICS HELPERS
// ==========================================

/**
 * @desc Aggregated stats for the Clinic Dashboard
 */
export const getClinicStats = async (tenantId) => {
  const [totalDoctors, patientResult] = await Promise.all([
    Doctor.countDocuments({ tenantId, isDeleted: { $ne: true } }),
    Doctor.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: "$patientsCount" } } }
    ])
  ]);

  return {
    totalDoctors,
    totalPatients: patientResult[0]?.total || 0,
    todayAppointments: 0, // Logic to be added once Appointment model is ready
    waitTime: 15
  };
};

// ==========================================
// TENANT & DIRECTORY SERVICES
// ==========================================

/**
 * @desc Fetch all clinics visible to patients
 */
export const getAllPublicClinics = async () => {
  return await Tenant.find({ "settings.isPublic": true }).select('-__v').lean();
};

/**
 * @desc Fetch clinic by owner (for initial login routing)
 */
export const getTenantByOwnerId = async (ownerId) => {
  return await Tenant.findOne({ ownerId }).lean();
};

/**
 * @desc Core profile updates
 */
export const updateTenantSettings = async (tenantId, updateData) => {
  return await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: updateData },
    { new: true, runValidators: true, lean: true }
  );
};

/**
 * @desc Public doctor list for a specific clinic (Used in Patient-facing directory)
 */
export const getPublicDoctorsService = async (tenantId) => {
  return await Doctor.find({ 
    tenantId, 
    isActive: true, 
    isDeleted: { $ne: true },
    status: { $in: ["On Duty", "On Break"] }
  })
  .select('name specialization education experience availability image rating status patientsCount')
  .lean(); 
};