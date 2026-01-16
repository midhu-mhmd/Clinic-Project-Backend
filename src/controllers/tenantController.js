import * as tenantService from "../services/tenantService.js";
import jwt from "jsonwebtoken";
import Tenant from "../models/tenantModel.js";

/**
 * @desc    Register a new Clinic and Owner (Triggers OTP via Service)
 */
export const createTenant = async (req, res, next) => {
  try {
    const { owner, clinic } = req.body;
    console.log("--- 🚀 STARTING REGISTRATION ---");
    
    const { user, tenant } = await tenantService.registerClinicTransaction(owner, clinic);

    // Initial token (User is still isVerified: false)
    const token = jwt.sign(
      { id: user._id, tenantId: tenant._id, role: user.role, isVerified: user.isVerified },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(201).json({
      success: true,
      message: "Registration successful. OTP sent to email.",
      token,
      user: { id: user._id, email: user.email, isVerified: user.isVerified }
    });
  } catch (error) {
    console.error("❌ REGISTRATION ERROR:", error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Verify OTP and Activate Account
 * @route   POST /api/tenants/verify-otp
 */
export const verifyEmailOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required" });
    }

    const user = await tenantService.verifyUserEmail(email, otp);

    // --- CRITICAL FIX FOR REDIRECT ---
    // Generate a NEW token now that the user IS verified
    // This allows the frontend to access protected routes (like plans/dashboard)
    const token = jwt.sign(
      { id: user._id, tenantId: user.tenantId, role: user.role, isVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      success: true,
      message: "Email verified successfully.",
      token, // Send the new token back
      user: { 
        id: user._id, 
        email: user.email, 
        tenantId: user.tenantId, 
        isVerified: true 
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Resend Verification OTP
 * @route   POST /api/tenants/resend-otp
 */
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    await tenantService.resendOTP(email);
    
    res.status(200).json({ 
      success: true, 
      message: "A new verification code has been sent to your email." 
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all public clinics for the directory
 */
export const getDirectory = async (req, res, next) => {
  try {
    const clinics = await tenantService.getAllPublicClinics();

    const formattedClinics = clinics.map((clinic, index) => ({
      _id: clinic._id,
      id: String(index + 1).padStart(2, "0"),
      name: clinic.name,
      location: clinic.address,
      tags: clinic.tags?.length > 0 ? clinic.tags : ["General Practice"],
      img: clinic.image,
      slug: clinic.slug,
      plan: clinic.subscription?.plan
    }));

    res.status(200).json(formattedClinics);
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load directory" });
  }
};

/**
 * @desc    Get a single clinic by ID
 */
export const getClinicById = async (req, res, next) => {
  try {
    const clinic = await Tenant.findById(req.params.id);

    if (!clinic) {
      return res.status(404).json({ success: false, message: "Facility not found." });
    }

    res.status(200).json({
      _id: clinic._id,
      name: clinic.name,
      location: clinic.address,
      img: clinic.image,
      tags: clinic.tags?.length > 0 ? clinic.tags : ["Verified Facility"],
      description: clinic.description || "Medical facility focused on clinical excellence.",
      owner: clinic.ownerId
    });
  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(400).json({ success: false, message: "Invalid ID format." });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get dashboard data
 */
export const getMyDashboard = async (req, res, next) => {
  try {
    const tenant = await tenantService.getTenantByOwnerId(req.user.id);
    if (!tenant) return res.status(404).json({ success: false, message: "Clinic not found" });
    res.status(200).json({ success: true, data: tenant });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching dashboard" });
  }
};

/**
 * @desc    Update Profile
 */
export const updateProfile = async (req, res, next) => {
  try {
    const updatedTenant = await tenantService.updateTenantSettings(req.user.tenantId, req.body);
    res.status(200).json({ success: true, message: "Updated successfully", data: updatedTenant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};