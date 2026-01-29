import express from "express";
import {
  sendRegisterOTP,
  verifyRegisterOTP,
  login,
  getProfile,
  googleLogin,
  requestOTP,
  resetPasswordWithOTP,
} from "./../controllers/userController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/send-otp", sendRegisterOTP);

router.post("/verify-otp", verifyRegisterOTP);

router.post("/login", login);
router.post("/google", googleLogin);

router.post("/forgot-password", requestOTP);
router.post("/reset-password-otp", resetPasswordWithOTP);

router.get("/me", protect, getProfile);

export default router;
