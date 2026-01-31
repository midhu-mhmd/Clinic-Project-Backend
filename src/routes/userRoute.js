import express from "express";
import {
  sendRegisterOTP,
  verifyRegisterOTP,
  login,
  getProfile,
  googleLogin,
  requestOTP,
  resetPasswordWithOTP,
  getAllUsers, // ✅ add this
} from "../controllers/userController.js";

import { protect, restrictTo } from "../middlewares/authMiddleware.js"; // ✅ include restrictTo

const router = express.Router();

/* =======================
   AUTH
======================= */
router.post("/send-otp", sendRegisterOTP);
router.post("/verify-otp", verifyRegisterOTP);

router.post("/login", login);
router.post("/google", googleLogin);

router.post("/forgot-password", requestOTP);
router.post("/reset-password-otp", resetPasswordWithOTP);

/* =======================
   USER PROFILE
======================= */
router.get("/me", protect, getProfile);

/* =======================
   ADMIN / SUPER ADMIN
   ✅ FIX: /api/users/all
======================= */
router.get(
  "/all",
  protect,
  restrictTo("SUPER_ADMIN", "CLINIC_ADMIN"),
  getAllUsers
);

export default router;
