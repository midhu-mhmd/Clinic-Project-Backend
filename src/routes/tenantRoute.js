import express from "express";
const router = express.Router();

import { 
  createTenant, 
  verifyEmailOTP, 
  resendOTP,
  loginTenant,
  forgotPasswordClinic,
  resetPasswordClinic,
  getDirectory, 
  getClinicById,
  getStats,      // Added for Dashboard Cards
  getProfile,    // Added for Header/Sidebar
  updateProfile,
  getClinicDoctorsPublic
} from "../controllers/tenantController.js";

import { protect, authorize } from "../middlewares/authMiddleware.js";

// ==========================================
// PUBLIC AUTH ROUTES
// ==========================================
router.post("/register", createTenant);
router.post("/login", loginTenant);
router.post("/verify-otp", verifyEmailOTP);
router.post("/resend-otp", resendOTP);
router.post("/forgot-password", forgotPasswordClinic);
router.post("/reset-password", resetPasswordClinic);

// ==========================================
// PUBLIC DIRECTORY DATA
// ==========================================
router.get("/all", getDirectory); 
router.get("/doctors/public/:clinicId", getClinicDoctorsPublic);

// ==========================================
// PROTECTED CLINIC ADMIN ROUTES
// ==========================================

/** * NOTE: We place specific paths like /stats and /profile ABOVE the /:id route 
 * to prevent Express from treating "stats" as an ":id" (CastError prevention).
 */
router.get("/stats", protect, authorize("CLINIC_ADMIN"), getStats);
router.get("/profile", protect, authorize("CLINIC_ADMIN"), getProfile);
router.put("/update", protect, authorize("CLINIC_ADMIN"), updateProfile);

// ==========================================
// DYNAMIC ROUTES (Always Last)
// ==========================================
router.get("/:id", getClinicById);

export default router;