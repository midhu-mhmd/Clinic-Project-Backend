import express from "express";
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
  getClinicDoctorsPublic,
  activateSubscriptionAfterPayment,
} from "../controllers/tenantController.js";

import { protect, authorize, protectPayment } from "../middlewares/authMiddleware.js";

const router = express.Router();

/* =========================================================
   1. PUBLIC AUTH (Clinic Registration & Security)
========================================================= */
router.post("/register", createTenant);
router.post("/login", loginTenant);
router.post("/verify-otp", verifyEmailOTP);
router.post("/resend-otp", resendOTP);
router.post("/forgot-password", forgotPasswordClinic);
router.post("/reset-password", resetPasswordClinic);

/* =========================================================
   2. PUBLIC DIRECTORY & PROFILE (Patient Facing)
   - These must be BEFORE the protect middleware
========================================================= */
router.get("/all", getDirectory);
router.get("/doctors/public/:clinicId", getClinicDoctorsPublic);

// ✅ MOVED: Clinic Profile is now public
// Place it before the auth shield so patients can view clinic details
router.get("/:id", getClinicById); 

/* =========================================================
   3. PAYMENT FLOW (Temporary Payment Token)
   - Used after OTP verify but before final subscription activation
========================================================= */
router.post(
  "/subscription/activate", 
  protectPayment, 
  authorize("CLINIC_ADMIN"), 
  activateSubscriptionAfterPayment
);

/* =========================================================
   4. PROTECTED ROUTES (Dashboard & Settings)
   - Requires full AUTH token and CLINIC_ADMIN role
========================================================= */

router.use(protect, authorize("CLINIC_ADMIN"));

router.get("/stats", getStats);
router.get("/profile", getProfile);
router.patch("/profile", updateProfile);
router.put("/change-password", changePassword);
router.post("/upload-image", upload.single("image"), uploadImage);

export default router;