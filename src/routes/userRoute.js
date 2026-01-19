import express from "express";
import {
  sendRegisterOTP,   // 👈 Changed from 'register'
  verifyRegisterOTP, // 👈 New Controller
  login,
  getProfile,
  googleLogin,
  requestOTP,
  resetPasswordWithOTP,
} from "./../controllers/userController.js";
import { protect  } from "../middlewares/authMiddleware.js";

const router = express.Router();

// --- PUBLIC ROUTES ---

// Step 1: Frontend calls this to send email
router.post("/send-otp", sendRegisterOTP); 

// Step 2: Frontend calls this to verify code & create user
router.post("/verify-otp", verifyRegisterOTP); 

router.post("/login", login);
router.post("/google", googleLogin);

// Forgot Password Flow
router.post("/forgot-password", requestOTP);
router.post("/reset-password-otp", resetPasswordWithOTP);

// --- PROTECTED ROUTES ---

router.get("/me", protect, getProfile);

export default router;