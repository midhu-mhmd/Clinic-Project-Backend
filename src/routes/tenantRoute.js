import express from "express";
const router = express.Router();
import upload from "../middlewares/uploadMiddleware.js"; 

import { 
  createTenant, 
  verifyEmailOTP, 
  resendOTP,
  loginTenant,
  forgotPasswordClinic,
  resetPasswordClinic,
  changePassword,
  getDirectory, 
  getClinicById,
  getStats,
  getProfile,
  updateProfile,
  uploadImage, 
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
router.put("/change-password", changePassword);

// ==========================================
// PUBLIC DIRECTORY DATA
// ==========================================
router.get("/all", getDirectory); 
router.get("/doctors/public/:clinicId", getClinicDoctorsPublic);

// ==========================================
// PROTECTED CLINIC ADMIN ROUTES
// ==========================================

// Dashbord Statistics
router.get("/stats", protect, authorize("CLINIC_ADMIN"), getStats);

// Profile Management
router.get("/profile", protect, authorize("CLINIC_ADMIN"), getProfile);
router.put("/update", protect, authorize("CLINIC_ADMIN"), updateProfile);

/** * @route POST /api/tenants/upload-image
 * Uses Multer memoryStorage to catch the file, then streams to Cloudinary
 */
router.post(
  "/upload-image", 
  protect, 
  authorize("CLINIC_ADMIN"), 
  upload.single("image"), // 'image' key must match your Frontend FormData key
  uploadImage
);

// ==========================================
// DYNAMIC ROUTES (Always Last)
// ==========================================
router.get("/:id", getClinicById);

export default router;