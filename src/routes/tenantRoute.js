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
  getClinicDoctorsPublic,
} from "../controllers/tenantController.js";

import { protect, authorize } from "../middlewares/authMiddleware.js";

router.post("/register", createTenant);
router.post("/login", loginTenant);
router.post("/verify-otp", verifyEmailOTP);
router.post("/resend-otp", resendOTP);
router.post("/forgot-password", forgotPasswordClinic);
router.post("/reset-password", resetPasswordClinic);
router.put("/change-password", changePassword);

router.get("/all", getDirectory);
router.get("/doctors/public/:clinicId", getClinicDoctorsPublic);

router.get("/stats", protect, authorize("CLINIC_ADMIN"), getStats);

router.get("/profile", protect, authorize("CLINIC_ADMIN"), getProfile);
router.put("/update", protect, authorize("CLINIC_ADMIN"), updateProfile);

router.post(
  "/upload-image",
  protect,
  authorize("CLINIC_ADMIN"),
  upload.single("image"), //
  uploadImage,
);

router.get("/:id", getClinicById);

export default router;
