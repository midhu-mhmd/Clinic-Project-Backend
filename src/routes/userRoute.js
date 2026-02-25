import express from "express";
import {
   sendRegisterOTP,
   verifyRegisterOTP,
   login,
   getProfile,
   updateProfile,
   googleLogin,
   requestOTP,
   resetPasswordWithOTP,
   getAllUsers, // ✅ add this
} from "../controllers/userController.js";

import { protect, restrictTo } from "../middlewares/authMiddleware.js"; // ✅ include restrictTo
import upload from "../middlewares/uploadMiddleware.js";

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
router.patch("/profile", protect, upload.single("image"), updateProfile);

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
