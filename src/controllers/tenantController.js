import * as tenantService from "../services/tenantService.js";
import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// ==========================================
// UTILITIES & MIDDLEWARE HELPERS
// ==========================================

const catchAsync = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

const generateToken = (payload, expiry = "1d") => {
  if (!process.env.JWT_SECRET) throw new Error("Internal Configuration Error: JWT_SECRET missing");
  
  return jwt.sign(
    {
      id: String(payload.id),
      tenantId: payload.tenantId ? String(payload.tenantId) : null,
      role: payload.role,
      isVerified: payload.isVerified,
    },
    process.env.JWT_SECRET,
    { expiresIn: expiry }
  );
};

// ==========================================
// PUBLIC DIRECTORY & CLINIC DATA
// ==========================================

/**
 * @desc Get all public clinics with optimized formatting
 */
export const getDirectory = catchAsync(async (req, res) => {
  const clinics = await tenantService.getAllPublicClinics();

  const formattedClinics = (clinics || []).map((clinic, index) => ({
    _id: clinic._id,
    indexId: String(index + 1).padStart(2, "0"),
    name: clinic.name || "Premier Health Clinic",
    location: clinic.address || "Regional Access",
    tags: Array.isArray(clinic.tags) && clinic.tags.length > 0 ? clinic.tags : ["General Practice"],
    img: clinic.image || "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=800",
    tier: clinic.subscription?.plan || "STANDARD"
  }));

  res.status(200).json({ success: true, data: formattedClinics });
});

/**
 * @desc Public view of practitioners within a specific clinic
 */
export const getClinicDoctorsPublic = catchAsync(async (req, res) => {
  const { clinicId } = req.params;
  const doctors = await tenantService.getPublicDoctorsService(clinicId);
  res.status(200).json({ success: true, data: doctors });
});

/**
 * @desc Public clinic details by ID
 */
export const getClinicById = catchAsync(async (req, res) => {
  const clinic = await Tenant.findById(req.params.id).lean();
  if (!clinic) return res.status(404).json({ success: false, message: "Clinic record not found." });
  res.status(200).json({ success: true, data: clinic });
});

// ==========================================
// AUTHENTICATION FLOW
// ==========================================

export const createTenant = catchAsync(async (req, res) => {
  const { owner, clinic } = req.body;
  const { user, tenant } = await tenantService.registerClinicTransaction(owner, clinic);

  const token = generateToken({
    id: user._id,
    tenantId: tenant._id,
    role: user.role,
    isVerified: user.isVerified
  });

  res.status(201).json({
    success: true,
    message: "Registration initiated. Verification code dispatched.",
    data: { token, user: { id: user._id, email: user.email, isVerified: user.isVerified } }
  });
});

export const loginTenant = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password").lean();

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }

  const token = generateToken({ 
    id: user._id, 
    tenantId: user.tenantId, 
    role: user.role, 
    isVerified: user.isVerified 
  });

  res.status(200).json({ 
    success: true, 
    data: { 
      token, 
      user: { id: user._id, email: user.email, role: user.role, tenantId: user.tenantId } 
    } 
  });
});

export const verifyEmailOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  const result = await tenantService.verifyUserEmail(email, otp);
  res.status(200).json({ success: true, message: "Account successfully verified.", data: result });
});

export const resendOTP = catchAsync(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email is required." });
  
  await tenantService.resendOTP(email);
  res.status(200).json({ success: true, message: "New security code dispatched." });
});

// ==========================================
// PROTECTED CLINIC MANAGEMENT (DASHBOARD)
// ==========================================

/**
 * @desc Get Dashboard Statistics (Patients, Doctors, Wait Time)
 */
export const getStats = catchAsync(async (req, res) => {
  const stats = await tenantService.getClinicStats(req.user.tenantId);
  res.status(200).json({ success: true, data: stats });
});

/**
 * @desc Get Logged-in Clinic Profile
 */
export const getProfile = catchAsync(async (req, res) => {
  const tenant = await Tenant.findById(req.user.tenantId).lean();
  if (!tenant) return res.status(404).json({ success: false, message: "Clinic association not found." });
  res.status(200).json({ success: true, data: tenant });
});

export const updateProfile = catchAsync(async (req, res) => {
  const updated = await tenantService.updateTenantSettings(req.user.tenantId, req.body);
  res.status(200).json({ success: true, message: "Profile updated successfully.", data: updated });
});

// ==========================================
// PASSWORD RECOVERY
// ==========================================

export const forgotPasswordClinic = catchAsync(async (req, res) => {
  // Logic inside tenantService to send OTP for password reset
  await tenantService.resendOTP(req.body.email); 
  res.status(200).json({ success: true, message: "Reset code dispatched to email." });
});

export const resetPasswordClinic = catchAsync(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  await tenantService.verifyUserEmail(email, otp); 
  
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await User.findOneAndUpdate(
    { email: email.toLowerCase().trim() }, 
    { $set: { password: hashedPassword } }
  );
  
  res.status(200).json({ success: true, message: "Password updated successfully." });
});