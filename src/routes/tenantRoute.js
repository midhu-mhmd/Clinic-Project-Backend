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
} from "../controllers/tenantController.js";

import { protect, authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();

/* =========================================================
   PUBLIC AUTH (Clinic)
========================================================= */
router.post("/register", createTenant);
router.post("/login", loginTenant);

router.post("/verify-otp", verifyEmailOTP);
router.post("/resend-otp", resendOTP);

router.post("/forgot-password", forgotPasswordClinic);
router.post("/reset-password", resetPasswordClinic);

/* =========================================================
   PUBLIC DIRECTORY (SCALE SAFE)
   ✅ GET /api/tenants/all?page=1&limit=30&search=abc
========================================================= */
router.get("/all", getDirectory);

/* =========================================================
   PUBLIC CLINIC READ
========================================================= */
router.get("/doctors/public/:clinicId", getClinicDoctorsPublic);

/**
 * IMPORTANT:
 * Keep /:id near the bottom so it doesn't match other routes.
 */
router.get("/:id", getClinicById);

/* =========================================================
   PROTECTED (Clinic Admin)
========================================================= */
router.get("/stats", protect, authorize("CLINIC_ADMIN"), getStats);

router.get("/profile", protect, authorize("CLINIC_ADMIN"), getProfile);
router.put("/update", protect, authorize("CLINIC_ADMIN"), updateProfile);

// ✅ change-password must be protected (you missed protect previously)
router.put("/change-password", protect, authorize("CLINIC_ADMIN"), changePassword);

/* =========================================================
   UPLOADS
========================================================= */
router.post(
  "/upload-image",
  protect,
  authorize("CLINIC_ADMIN"),
  upload.single("image"),
  uploadImage
);

export default router;
