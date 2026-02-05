import * as tenantService from "../services/tenantService.js";
import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import mongoose from "mongoose";

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
const normalizeStr = (v = "") => String(v ?? "").trim();
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));

const toInt = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/* =========================================================
   Token Helpers
   - PAYMENT token: after OTP verify (restricted access)
   - AUTH token: after final login (full dashboard access)
========================================================= */
const requireJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("Internal Configuration Error: JWT_SECRET missing");
  }
};

const signPaymentToken = (user) => {
  requireJwtSecret();
  return jwt.sign(
    {
      id: String(user._id),
      tenantId: user.tenantId ? String(user.tenantId) : null,
      role: user.role,
      isVerified: Boolean(user.isVerified),
      purpose: "PAYMENT",
    },
    process.env.JWT_SECRET,
    { expiresIn: "30m" }
  );
};

const signAuthToken = (user) => {
  requireJwtSecret();
  return jwt.sign(
    {
      id: String(user._id),
      tenantId: user.tenantId ? String(user.tenantId) : null,
      role: user.role,
      isVerified: Boolean(user.isVerified),
      purpose: "AUTH",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

/**
 * ✅ Prevent mass assignment (whitelist fields)
 */
const pickAllowedTenantUpdate = (body = {}) => {
  const update = {};
  if (body.name !== undefined) update.name = normalizeStr(body.name);
  if (body.address !== undefined) update.address = normalizeStr(body.address);
  if (body.description !== undefined) update.description = normalizeStr(body.description);
  if (Array.isArray(body.tags)) update.tags = body.tags;

  if (body.settings && typeof body.settings === "object") {
    update.settings = {};
    if (body.settings.themeColor !== undefined)
      update.settings.themeColor = normalizeStr(body.settings.themeColor);
    if (body.settings.isPublic !== undefined)
      update.settings.isPublic = Boolean(body.settings.isPublic);
  }
  return update;
};

/* =========================================================
   ✅ PUBLIC DIRECTORY
========================================================= */
export const getDirectory = catchAsync(async (req, res) => {
  const page = Math.max(toInt(req.query.page, 1), 1);
  const limit = Math.min(Math.max(toInt(req.query.limit, 30), 1), 60);
  const search = normalizeStr(req.query.search);

  const result = await tenantService.getAllPublicClinics({ page, limit, search });

  const formattedClinics = (result?.data || []).map((clinic, idx) => ({
    _id: clinic._id,
    indexId: String((page - 1) * limit + idx + 1).padStart(2, "0"),
    name: clinic.name || "Premier Health Clinic",
    location: clinic.address || "Regional Access",
    tags: clinic.tags?.length ? clinic.tags : ["General Practice"],
    img: clinic.image || "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=800",
    tier: clinic.subscription?.plan,
    price: clinic.subscription?.price,
    subscriptionStatus: clinic.subscription?.status,
  }));

  return res.status(200).json({
    success: true,
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / result.limit),
    },
    data: formattedClinics,
  });
});

export const getClinicDoctorsPublic = catchAsync(async (req, res) => {
  const doctors = await tenantService.getPublicDoctorsService(req.params.clinicId);
  return res.status(200).json({ success: true, data: doctors });
});

export const getClinicById = catchAsync(async (req, res) => {
  const clinic = await Tenant.findById(req.params.id)
    .select("-__v")
    .lean();

  if (!clinic) return res.status(404).json({ success: false, message: "Clinic not found." });
  return res.status(200).json({ success: true, data: clinic });
});

/* =========================================================
   ✅ REGISTRATION & AUTH
========================================================= */
export const createTenant = catchAsync(async (req, res) => {
  const { owner, clinic } = req.body;
  const { user, tenant } = await tenantService.registerClinicTransaction(owner, clinic);

  return res.status(201).json({
    success: true,
    message: "Registration successful. OTP dispatched.",
    data: { email: user.email, tenantId: tenant._id },
  });
});

export const verifyEmailOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  const { user } = await tenantService.verifyUserEmail(email, otp);

  // Issued for the payment flow gate
  const paymentToken = signPaymentToken(user);

  return res.status(200).json({
    success: true,
    message: "Email verified. Proceed to subscription.",
    token: paymentToken,
    data: { user: { id: user._id, email: user.email, tenantId: user.tenantId } },
  });
});

export const resendOTP = catchAsync(async (req, res) => {
  await tenantService.resendOTP(req.body.email);
  return res.status(200).json({ success: true, message: "Code resent successfully." });
});

export const loginTenant = catchAsync(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const user = await User.findOne({ email }).select("+password role tenantId isVerified");

  if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }

  if (!user.isVerified) {
    return res.status(403).json({ success: false, message: "Please verify email first." });
  }

  const tenant = await Tenant.findById(user.tenantId).select("subscription");
  if (tenant?.subscription?.status !== "ACTIVE") {
    return res.status(402).json({
      success: false,
      message: "Payment required.",
      data: { status: tenant?.subscription?.status },
    });
  }

  const token = signAuthToken(user);
  return res.status(200).json({ success: true, token, data: { user } });
});

/* =========================================================
   ✅ SUBSCRIPTION ACTIVATION
========================================================= */
export const activateSubscriptionAfterPayment = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId || req.body?.tenantId;
  const { razorpayOrderId, razorpayPaymentId, plan } = req.body;

  if (!razorpayPaymentId) {
    return res.status(400).json({ success: false, message: "Payment details missing." });
  }

  const updatedTenant = await tenantService.activateTenantSubscription({
    tenantId,
    razorpayOrderId,
    razorpayPaymentId,
    plan,
  });

  return res.status(200).json({
    success: true,
    message: "Subscription activated.",
    data: { subscription: updatedTenant.subscription },
  });
});

/* =========================================================
   ✅ PROFILE & SETTINGS (Protected)
========================================================= */
export const getProfile = catchAsync(async (req, res) => {
  const tenant = await tenantService.getTenantProfile(req.user.tenantId);
  return res.status(200).json({ success: true, data: tenant });
});

export const updateProfile = catchAsync(async (req, res) => {
  const safeBody = pickAllowedTenantUpdate(req.body);
  const updated = await tenantService.updateTenantSettings(req.user.tenantId, safeBody);

  return res.status(200).json({ success: true, message: "Profile updated.", data: updated });
});

export const uploadImage = catchAsync(async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ success: false, message: "No file provided." });
  }

  const cloudinaryResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "clinic_logos" },
      (error, result) => (result ? resolve(result) : reject(error))
    );
    stream.end(req.file.buffer);
  });

  const updated = await tenantService.updateTenantImageService(req.user.tenantId, cloudinaryResult.secure_url);

  return res.status(200).json({ success: true, imageUrl: updated.image });
});

/* =========================================================
   ✅ SECURITY & PASSWORD
========================================================= */
export const forgotPasswordClinic = catchAsync(async (req, res) => {
  await tenantService.resendOTP(req.body.email);
  return res.status(200).json({ success: true, message: "Reset code sent." });
});

export const resetPasswordClinic = catchAsync(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  await tenantService.verifyUserEmail(email, otp);

  const hashedPassword = await bcrypt.hash(String(newPassword), 12);
  await User.findOneAndUpdate({ email: normalizeEmail(email) }, { password: hashedPassword });

  return res.status(200).json({ success: true, message: "Password reset successful." });
});

export const changePassword = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).select("+password");
  const isMatch = await bcrypt.compare(req.body.currentPassword, user.password);

  if (!isMatch) return res.status(401).json({ success: false, message: "Current password incorrect." });

  user.password = await bcrypt.hash(String(req.body.newPassword), 12);
  await user.save();

  return res.status(200).json({ success: true, message: "Password updated." });
});

export const getStats = catchAsync(async (req, res) => {
  const stats = await tenantService.getClinicStats(req.user.tenantId);
  return res.status(200).json({ success: true, data: stats });
});

export const getSecuritySettings = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  const sessions = [{
    browser: String(req.headers["user-agent"] || "").split(" ")[0] || "Unknown",
    ipAddress: req.ip || "127.0.0.1",
    lastAccess: "Active Now",
    isCurrent: true,
  }];

  return res.status(200).json({
    success: true,
    data: { twoFactor: Boolean(user.twoFactorEnabled), sessions },
  });
});