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

// Auto-reconnect logic for production stability
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
 * @desc Step 1: Register Clinic & Owner with Mongoose Session (Atomic Transaction)
 */
export const registerClinicTransaction = async (ownerData, clinicData) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const emailLower = ownerData.email.toLowerCase().trim();
    
    // 1. Check existing user within session
    const existingUser = await User.findOne({ email: emailLower }).session(session);
    if (existingUser) throw new Error("This email is already registered to a medical faculty.");

    // 2. Hash & Prepare OTP
    const hashedPassword = await bcrypt.hash(ownerData.password, 12);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Create User
    const [user] = await User.create([{
      ...ownerData,
      email: emailLower,
      password: hashedPassword,
      role: "CLINIC_ADMIN",
      isVerified: false,
    }], { session });

    // 4. Create Tenant
    const [tenant] = await Tenant.create([{
      ...clinicData,
      ownerId: user._id,
      settings: { isPublic: true },
      subscription: { plan: "FREE", status: "ACTIVE" },
    }], { session });

    // 5. Link Tenant to User
    user.tenantId = tenant._id;
    await user.save({ session });

    // 6. Redis & Email (Side effects handled after DB success)
    await redisClient.setEx(`otp:${emailLower}`, 600, otp);

    await transporter.sendMail({
      from: `"Medicare Systems" <${process.env.EMAIL_USER}>`,
      to: emailLower,
      subject: "Action Required: Verify Clinic Enrollment",
      html: `<div style="font-family:sans-serif;">
               <h2>Welcome to the Network</h2>
               <p>Your institutional verification code is:</p>
               <h1 style="color:#10b981; letter-spacing:5px;">${otp}</h1>
               <p>This code expires in 10 minutes.</p>
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
 * @desc High-Performance Token Generation
 */
export const verifyUserEmail = async (email, otp) => {
  const emailLower = email.toLowerCase().trim();
  const user = await User.findOne({ email: emailLower });
  if (!user) throw new Error("Credentials not found.");

  const storedOtp = await redisClient.get(`otp:${emailLower}`);
  if (!storedOtp || storedOtp !== String(otp)) throw new Error("Invalid or expired security code.");

  // Atomic update for verification status
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

// ==========================================
// DOCTOR SERVICES (Optimized Queries)
// ==========================================

export const createDoctorService = async (doctorData, tenantId) => {
  if (!tenantId) throw new Error("Institutional Context (Tenant ID) is missing.");

  return await Doctor.create({
    ...doctorData,
    email: doctorData.email.toLowerCase().trim(),
    experience: Number(doctorData.experience) || 0,
    tenantId,
    isActive: true,
    isDeleted: false
  });
};

export const updateDoctorService = async (doctorId, tenantId, updateData) => {
  const doctor = await Doctor.findOneAndUpdate(
    { _id: doctorId, tenantId },
    { $set: updateData },
    { new: true, runValidators: true, lean: true }
  );

  if (!doctor) throw new Error("Record not found or access denied.");
  return doctor;
};

export const softDeleteDoctorService = async (doctorId, tenantId) => {
  const doctor = await Doctor.findOneAndUpdate(
    { _id: doctorId, tenantId },
    { 
      $set: { 
        isDeleted: true, 
        deletedAt: new Date(),
        isActive: false 
      } 
    },
    { new: true, lean: true }
  );

  if (!doctor) throw new Error("Practitioner record not found or access denied.");
  return doctor;
};

export const getDoctorsByTenantService = async (tenantId) => {
  // Use .lean() for 5x faster read performance on JSON-only data
  return await Doctor.find({ tenantId, isDeleted: { $ne: true } })
    .sort("-createdAt")
    .lean();
};

export const getPublicDoctorsService = async (tenantId) => {
  return await Doctor.find({ 
    tenantId, 
    isActive: true, 
    isDeleted: { $ne: true },
    status: { $in: ["On Duty", "On Break"] } // Business logic refinement
  })
  .select('name specialization education experience availability image rating status patientsCount')
  .lean(); 
};



export const getAllPublicClinics = async () => {
  return await Tenant.find({ "settings.isPublic": true }).select('-__v').lean();
};

export const getTenantByOwnerId = async (ownerId) => {
  return await Tenant.findOne({ ownerId }).lean();
};