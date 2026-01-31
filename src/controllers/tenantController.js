import * as tenantService from "../services/tenantService.js";
import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";

/* =========================================================
   Cloudinary Config
========================================================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* =========================================================
   Small utils
========================================================= */
const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const signToken = (user, expiry = "1d") => {
  if (!process.env.JWT_SECRET) {
    throw new Error("Internal Configuration Error: JWT_SECRET missing");
  }

  return jwt.sign(
    {
      id: String(user._id || user.id),
      tenantId: user.tenantId ? String(user.tenantId) : null,
      role: user.role,
      isVerified: Boolean(user.isVerified),
    },
    process.env.JWT_SECRET,
    { expiresIn: expiry }
  );
};

const toInt = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/* =========================================================
   ✅ PUBLIC DIRECTORY (scalable)
   - supports pagination + search
   - fast response (projection + lean in service)
========================================================= */
export const getDirectory = catchAsync(async (req, res) => {
  const page = Math.max(toInt(req.query.page, 1), 1);
  const limit = Math.min(Math.max(toInt(req.query.limit, 30), 1), 60);
  const search = String(req.query.search || "").trim();

  const result = await tenantService.getAllPublicClinics({
    page,
    limit,
    search,
  });

  const clinics = result?.data || [];
  const formattedClinics = clinics.map((clinic, idx) => ({
    _id: clinic._id,
    indexId: String((page - 1) * limit + idx + 1).padStart(2, "0"),
    name: clinic.name || "Premier Health Clinic",
    location: clinic.address || "Regional Access",
    tags:
      Array.isArray(clinic.tags) && clinic.tags.length > 0
        ? clinic.tags
        : ["General Practice"],
    img:
      clinic.image ||
      "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=800",
    tier: clinic.subscription?.plan || "PRO",
    subscriptionStatus: clinic.subscription?.status || "PENDING_VERIFICATION",
  }));

  return res.status(200).json({
    success: true,
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / result.limit),
      search,
    },
    data: formattedClinics,
  });
});

/* =========================================================
   ✅ PUBLIC CLINIC DOCTORS
========================================================= */
export const getClinicDoctorsPublic = catchAsync(async (req, res) => {
  const { clinicId } = req.params;
  const doctors = await tenantService.getPublicDoctorsService(clinicId);
  return res.status(200).json({ success: true, data: doctors });
});

/* =========================================================
   ✅ GET CLINIC BY ID (public)
========================================================= */
export const getClinicById = catchAsync(async (req, res) => {
  const clinic = await Tenant.findById(req.params.id).lean();
  if (!clinic) {
    return res
      .status(404)
      .json({ success: false, message: "Clinic record not found." });
  }
  return res.status(200).json({ success: true, data: clinic });
});

/* =========================================================
   ✅ REGISTER CLINIC (creates CLINIC_ADMIN + Tenant)
========================================================= */
export const createTenant = catchAsync(async (req, res) => {
  const { owner, clinic } = req.body;

  const { user, tenant } = await tenantService.registerClinicTransaction(
    owner,
    clinic
  );

  // token issued even if not verified (your flow)
  const token = signToken(user);

  return res.status(201).json({
    success: true,
    message: "Registration initiated. Verification code dispatched.",
    data: {
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        tenantId: tenant._id,
        isVerified: Boolean(user.isVerified),
      },
      tenant: {
        id: tenant._id,
        name: tenant.name,
        subscription: tenant.subscription,
      },
    },
  });
});

/* =========================================================
   ✅ TENANT LOGIN (clinic admin)
========================================================= */
export const loginTenant = catchAsync(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Email and password are required." });
  }

  // lean for speed
  const user = await User.findOne({ email })
    .select("+password role tenantId isVerified email")
    .lean();

  if (!user) {
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }

  // Optional: ensure clinic-admin only in this login endpoint
  // If you want clinic-only:
  // if (user.role !== "CLINIC_ADMIN") return res.status(403).json({ success:false, message:"Forbidden" });

  const token = signToken(user);

  return res.status(200).json({
    success: true,
    data: {
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId || null,
        isVerified: Boolean(user.isVerified),
      },
    },
  });
});

/* =========================================================
   ✅ VERIFY EMAIL OTP
========================================================= */
export const verifyEmailOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  const result = await tenantService.verifyUserEmail(email, otp);

  return res.status(200).json({
    success: true,
    message: "Account successfully verified.",
    data: result,
  });
});

/* =========================================================
   ✅ RESEND OTP
========================================================= */
export const resendOTP = catchAsync(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }

  await tenantService.resendOTP(email);

  return res.status(200).json({
    success: true,
    message: "New security code dispatched.",
  });
});

/* =========================================================
   ✅ CLINIC DASHBOARD STATS (protected)
========================================================= */
export const getStats = catchAsync(async (req, res) => {
  const stats = await tenantService.getClinicStats(req.user.tenantId);
  return res.status(200).json({ success: true, data: stats });
});

/* =========================================================
   ✅ CLINIC PROFILE (protected)
========================================================= */
export const getProfile = catchAsync(async (req, res) => {
  const tenant = await tenantService.getTenantProfile(req.user.tenantId);
  return res.status(200).json({ success: true, data: tenant });
});

/* =========================================================
   ✅ UPDATE PROFILE (protected)
========================================================= */
export const updateProfile = catchAsync(async (req, res) => {
  const updated = await tenantService.updateTenantSettings(req.user.tenantId, req.body);

  return res.status(200).json({
    success: true,
    message: "Profile synchronized.",
    data: updated,
  });
});

/* =========================================================
   ✅ UPLOAD IMAGE (protected)
========================================================= */
export const uploadImage = catchAsync(async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ success: false, message: "No image file provided." });
  }

  const cloudinaryResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "clinic_logos" },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    stream.end(req.file.buffer);
  });

  const imageUrl = cloudinaryResult.secure_url;

  const updated = await tenantService.updateTenantImageService(req.user.tenantId, imageUrl);

  return res.status(200).json({
    success: true,
    message: "Clinic logo updated.",
    imageUrl: updated.image,
  });
});

/* =========================================================
   ✅ FORGOT PASSWORD (clinic)
   - sends OTP (best effort)
========================================================= */
export const forgotPasswordClinic = catchAsync(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }

  await tenantService.resendOTP(email);

  return res.status(200).json({
    success: true,
    message: "Reset code dispatched to email.",
  });
});

/* =========================================================
   ✅ RESET PASSWORD (clinic) using OTP
========================================================= */
export const resetPasswordClinic = catchAsync(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Email, OTP and newPassword are required.",
    });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters.",
    });
  }

  // verify OTP (also marks verified)
  await tenantService.verifyUserEmail(email, otp);

  const hashedPassword = await bcrypt.hash(String(newPassword), 12);

  await User.findOneAndUpdate(
    { email: normalizeEmail(email) },
    { $set: { password: hashedPassword } },
    { new: false }
  );

  return res.status(200).json({
    success: true,
    message: "Password updated successfully.",
  });
});

/* =========================================================
   ✅ CHANGE PASSWORD (protected)
========================================================= */
export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "currentPassword and newPassword are required.",
    });
  }

  const user = await User.findById(req.user.id).select("+password");
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    return res.status(401).json({ success: false, message: "Current password incorrect." });
  }

  user.password = await bcrypt.hash(String(newPassword), 12);
  await user.save();

  return res.status(200).json({ success: true, message: "Password updated successfully." });
});

/* =========================================================
   ✅ SECURITY SETTINGS (protected)
========================================================= */
export const getSecuritySettings = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  const sessions = [
    {
      browser: String(req.headers["user-agent"] || "").split(" ")[0] || "Unknown",
      os: "Identified System",
      ipAddress: req.ip || "127.0.0.1",
      lastAccess: "Active Now",
      isCurrent: true,
    },
  ];

  return res.status(200).json({
    success: true,
    data: {
      twoFactor: Boolean(user.twoFactorEnabled),
      sessions,
    },
  });
});
