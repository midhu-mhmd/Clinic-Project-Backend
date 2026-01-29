import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import Doctor from "../models/doctorModel.js";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import { createClient } from "redis";
import mongoose from "mongoose";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
});

redisClient.on("error", (err) => console.error("❌ Redis Client Error:", err));

const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) await redisClient.connect();
    console.log("✅ Redis Connected Successfully");
  } catch (err) {
    console.error("Critical: Could not connect to Redis", err);
  }
};
connectRedis();

const getTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn(
      "⚠️ Warning: Email credentials missing from ENV. Mail will fail.",
    );
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

export const registerClinicTransaction = async (ownerData, clinicData) => {
  const emailLower = ownerData.email.toLowerCase().trim();
  let createdUser = null;

  try {
    const existingUser = await User.findOne({ email: emailLower });
    if (existingUser) throw new Error("Email already registered.");

    const existingClinic = await Tenant.findOne({
      registrationId: clinicData.registrationId,
    });
    if (existingClinic)
      throw new Error("This Clinic Registration ID is already in use.");

    const hashedPassword = await bcrypt.hash(ownerData.password, 12);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    createdUser = await User.create({
      ...ownerData,
      email: emailLower,
      password: hashedPassword,
      role: "CLINIC_ADMIN",
      isVerified: false,
    });

    const tenant = await Tenant.create({
      ...clinicData,
      ownerId: createdUser._id,
      settings: { isPublic: true },
      subscription: { plan: "FREE", status: "ACTIVE" },
    });

    createdUser.tenantId = tenant._id;
    await createdUser.save();

    if (redisClient.isOpen) {
      await redisClient.setEx(`otp:${emailLower}`, 600, otp);
    }

    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Medicare Systems" <${process.env.EMAIL_USER}>`,
      to: emailLower,
      subject: "Action Required: Verify Clinic Enrollment",
      html: `
        <div style="font-family:sans-serif; text-align: center; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #8DAA9D;">Welcome to Sovereign</h2>
          <p>Your institutional verification code is:</p>
          <h1 style="letter-spacing: 5px; font-size: 32px;">${otp}</h1>
          <p>This code expires in 10 minutes.</p>
        </div>`,
    });

    return { user: createdUser, tenant };
  } catch (error) {
    if (createdUser && !createdUser.tenantId) {
      await User.findByIdAndDelete(createdUser._id);
    }
    console.error("Registration Service Error:", error.message);
    throw error;
  }
};

export const verifyUserEmail = async (email, otp) => {
  const emailLower = email.toLowerCase().trim();
  const user = await User.findOne({ email: emailLower });
  if (!user) throw new Error("Credentials not found.");

  if (!redisClient.isOpen) throw new Error("Security service unavailable.");
  const storedOtp = await redisClient.get(`otp:${emailLower}`);

  if (!storedOtp || storedOtp !== String(otp))
    throw new Error("Invalid or expired security code.");

  if (!user.isVerified) {
    await User.updateOne({ _id: user._id }, { $set: { isVerified: true } });
  }

  await redisClient.del(`otp:${emailLower}`);

  const token = jwt.sign(
    { id: user._id, role: user.role, tenantId: user.tenantId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );

  return { token, user };
};

export const resendOTP = async (email) => {
  const emailLower = email.toLowerCase().trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await redisClient.setEx(`otp:${emailLower}`, 600, otp);

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Medicare Systems" <${process.env.EMAIL_USER}>`,
    to: emailLower,
    subject: "New Verification Code",
    html: `<p>Your new security code is: <b>${otp}</b></p>`,
  });
};

export const getClinicStats = async (tenantId) => {
  if (!mongoose.Types.ObjectId.isValid(tenantId))
    throw new Error("Invalid Clinic Reference.");

  const [totalDoctors, patientResult] = await Promise.all([
    Doctor.countDocuments({ tenantId, isDeleted: { $ne: true } }),
    Doctor.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          isDeleted: { $ne: true },
        },
      },
      { $group: { _id: null, total: { $sum: "$patientsCount" } } },
    ]),
  ]);

  return {
    totalDoctors,
    totalPatients: patientResult[0]?.total || 0,
    todayAppointments: 0,
    waitTime: 15,
  };
};

export const getAllPublicClinics = async () => {
  return await Tenant.find({ "settings.isPublic": true }).select("-__v").lean();
};

export const getTenantProfile = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new Error("Clinic profile does not exist.");
  return tenant;
};

export const updateTenantSettings = async (tenantId, updateData) => {
  const finalUpdate = { ...updateData };

  if (updateData.settings) {
    Object.keys(updateData.settings).forEach((key) => {
      finalUpdate[`settings.${key}`] = updateData.settings[key];
    });
    delete finalUpdate.settings;
  }

  return await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: finalUpdate },
    { new: true, runValidators: true, lean: true },
  );
};

export const updateTenantImageService = async (tenantId, imageUrl) => {
  return await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: { image: imageUrl } },
    { new: true, lean: true },
  );
};

export const getPublicDoctorsService = async (tenantId) => {
  return await Doctor.find({
    tenantId,
    isActive: true,
    isDeleted: { $ne: true },
    status: { $in: ["On Duty", "On Break"] },
  })
    .select(
      "name specialization education experience availability image rating status patientsCount",
    )
    .lean();
};
