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


router.post("/register", createTenant);
router.post("/login", loginTenant);
router.post("/verify-otp", verifyEmailOTP);
router.post("/resend-otp", resendOTP);
router.post("/forgot-password", forgotPasswordClinic);
router.post("/reset-password", resetPasswordClinic);


router.get("/stats", protect, authorize("CLINIC_ADMIN"), getStats);
router.get("/profile", protect, authorize("CLINIC_ADMIN"), getProfile);
router.patch("/profile", protect, authorize("CLINIC_ADMIN"), updateProfile);
router.put("/change-password", protect, authorize("CLINIC_ADMIN"), changePassword);
router.post("/upload-image", protect, authorize("CLINIC_ADMIN"), upload.single("image"), uploadImage);

/* =========================================================
   3. PAYMENT FLOW
========================================================= */
router.post(
  "/subscription/activate", 
  protectPayment, 
  authorize("CLINIC_ADMIN"), 
  activateSubscriptionAfterPayment
);

/* =========================================================
   4. PUBLIC DIRECTORY & PROFILE (Patient Facing)
========================================================= */
router.get("/all", getDirectory);
router.get("/doctors/public/:clinicId", getClinicDoctorsPublic);

// ✅ FIXED: Move this to the bottom. 
// If it stays at the top, it treats "profile" or "stats" as an ID.
router.get("/:id", getClinicById); 

export default router;