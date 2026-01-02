import express from "express";
import {
  register,
  login,
  getProfile,
  googleLogin,
  requestOTP,
  resetPasswordWithOTP,
} from "./../controllers/userController.js";
import { auth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// PUBLIC ROUTES

router.post("/register", register);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/forgot-password", requestOTP);
router.post("/reset-password-otp", resetPasswordWithOTP);

// PROTECTED ROUTES

router.get("/me", auth, getProfile);

export default router;
