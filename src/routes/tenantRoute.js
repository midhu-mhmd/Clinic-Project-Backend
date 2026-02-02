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
   PUBLIC CLINIC DOCTORS
========================================================= */
router.get("/doctors/public/:clinicId", getClinicDoctorsPublic);

/* =========================================================
   PROTECTED (Clinic Admin)
========================================================= */
router.use(protect, authorize("CLINIC_ADMIN"));

router.get("/stats", getStats);
router.get("/profile", getProfile);
router.put("/update", updateProfile);
router.put("/change-password", changePassword);

router.post(
  "/upload-image",
  upload.single("image"),
  uploadImage
);

/* =========================================================
   PUBLIC CLINIC READ (KEEP LAST)
   IMPORTANT: keep /:id at bottom to avoid route collisions
========================================================= */
router.get("/:id", getClinicById);

export default router;
