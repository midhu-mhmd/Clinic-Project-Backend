import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import nodemailer from "nodemailer";

import {
  verifyEmailTemplate,
  welcomeEmailTemplate,
} from "../utils/emailTemplates.js";

import {
  createUser,
  findUserByEmail,
  findUserById,
  updatePassword,
  saveTempRegistration,
  getTempRegistration,
  deleteTempRegistration,
  saveOTPToCache,
  getOTPFromCache,
  deleteOTPFromCache,
} from "../services/userService.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ---------------- helpers ----------------
const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const isValidEmail = (email = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);

const generateOtp6 = () => String(Math.floor(100000 + Math.random() * 900000));

/**
 * Token includes tenantId (critical for clinic-side flows)
 */
const generateToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      role: user.role,
      tenantId: user.tenantId ? String(user.tenantId) : null,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

/**
 * Always return safe + consistent user payload
 */
const safeUserPayload = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  tenantId: user.tenantId ? String(user.tenantId) : null,
});

// ---------------- mailer (cached) ----------------
let transporter;
const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  transporter.verify().catch((e) => {
    console.error("❌ SMTP verify failed:", e.message);
  });

  return transporter;
};

const sendMailBestEffort = async (mailOptions) => {
  try {
    await getTransporter().sendMail(mailOptions);
  } catch (err) {
    console.error("📧 Mail error:", err.message);
  }
};

// ===================================================================
//  REGISTER OTP FLOW
// ===================================================================

/**
 * SEND REGISTER OTP (stores temp reg in Redis - 10 min)
 */
export const sendRegisterOTP = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name?.trim() || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required.",
      });
    }

    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format.",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const existing = await findUserByEmail(normalized);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email already registered.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOtp6();

    await saveTempRegistration(normalized, {
      name: String(name).trim(),
      email: normalized,
      password: hashedPassword,
      otp,
    });

    // For debugging (avoid in production)
    console.log(`🔑 REGISTRATION OTP FOR ${normalized}: ${otp}`);

    await sendMailBestEffort({
      from: `"Sovereign Protocol" <${process.env.EMAIL_USER}>`,
      to: normalized,
      subject: "Authentication Required | Sovereign",
      html: verifyEmailTemplate(otp),
    });

    return res.status(200).json({
      success: true,
      message: "OTP processed. Check your email.",
    });
  } catch (err) {
    console.error("sendRegisterOTP error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * VERIFY REGISTER OTP (creates real user)
 */
export const verifyRegisterOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalized = normalizeEmail(email);

    if (!normalized || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required.",
      });
    }

    const stored = await getTempRegistration(normalized);
    if (!stored) {
      return res.status(400).json({ success: false, message: "OTP expired." });
    }

    if (String(otp).trim() !== String(stored.otp).trim()) {
      return res.status(400).json({ success: false, message: "Invalid OTP." });
    }

    // Prevent race condition double create
    const already = await findUserByEmail(normalized);
    if (already) {
      await deleteTempRegistration(normalized);
      return res.status(409).json({
        success: false,
        message: "Email already registered.",
      });
    }

    if (!stored.password) {
      await deleteTempRegistration(normalized);
      return res.status(400).json({
        success: false,
        message: "Temp registration data corrupted. Retry registration.",
      });
    }

    const user = await createUser({
      name: stored.name,
      email: normalized,
      password: stored.password, // already hashed
      role: "PATIENT",
    });

    await deleteTempRegistration(normalized);

    const loginLink = "http://localhost:5173/login";
    await sendMailBestEffort({
      from: `"Sovereign Protocol" <${process.env.EMAIL_USER}>`,
      to: normalized,
      subject: "Humanity Verified | Welcome to Sovereign",
      html: welcomeEmailTemplate(stored.name, loginLink),
    });

    return res.status(201).json({
      success: true,
      message: "Registration verified.",
      token: generateToken(user),
      user: safeUserPayload(user),
    });
  } catch (err) {
    console.error("verifyRegisterOTP error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// ===================================================================
//  LOGIN
// ===================================================================

export const login = async (req, res) => {
  try {
    const normalized = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!normalized || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    if (!isValidEmail(normalized)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format.",
      });
    }

    const user = await findUserByEmail(normalized); // selects +password
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    return res.status(200).json({
      success: true,
      token: generateToken(user),
      user: safeUserPayload(user),
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// ===================================================================
//  GOOGLE LOGIN
// ===================================================================

export const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ success: false, message: "Missing credential." });
    }

    const ticket = await googleClient.verifyIdToken({
      audience: process.env.GOOGLE_CLIENT_ID,
      idToken: credential,
    });

    const gp = ticket.getPayload();
    const email = normalizeEmail(gp?.email);
    const name = gp?.name || "User";

    if (!email) {
      return res.status(400).json({ success: false, message: "Google email missing." });
    }

    let user = await findUserByEmail(email);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;

      const hashedPassword = await bcrypt.hash(
        crypto.randomBytes(16).toString("hex"),
        10
      );

      user = await createUser({
        name,
        email,
        password: hashedPassword,
        role: "PATIENT",
      });

      const loginLink = "http://localhost:5173/login";
      await sendMailBestEffort({
        from: `"Sovereign Protocol" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Identity Verified | Welcome to Sovereign",
        html: welcomeEmailTemplate(name, loginLink),
      });
    }

    return res.status(200).json({
      success: true,
      token: generateToken(user),
      user: safeUserPayload(user),
      isNewUser,
    });
  } catch (err) {
    console.error("googleLogin error:", err);
    return res.status(401).json({
      success: false,
      message: "Google authentication failed.",
    });
  }
};

// ===================================================================
//  FORGOT PASSWORD OTP FLOW
// ===================================================================

/**
 * REQUEST OTP (Forgot password)
 * Returns same response even if user not found (prevents enumeration)
 */
export const requestOTP = async (req, res) => {
  try {
    const normalized = normalizeEmail(req.body.email);

    if (!normalized) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const user = await findUserByEmail(normalized);

    // Security: don't leak user existence
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If the email exists, OTP has been processed.",
      });
    }

    const otp = generateOtp6();
    await saveOTPToCache(normalized, otp);

    console.log(`🔑 RESET OTP FOR ${normalized}: ${otp}`);

    await sendMailBestEffort({
      from: `"Sovereign Protocol" <${process.env.EMAIL_USER}>`,
      to: normalized,
      subject: "Secure Recovery | Sovereign",
      text: `Your recovery code: ${otp}`,
    });

    return res.status(200).json({
      success: true,
      message: "If the email exists, OTP has been processed.",
    });
  } catch (err) {
    console.error("requestOTP error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * RESET PASSWORD WITH OTP
 */
export const resetPasswordWithOTP = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const normalized = normalizeEmail(email);

    if (!normalized || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP and newPassword are required.",
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const cachedOtp = await getOTPFromCache(normalized);
    if (!cachedOtp || String(cachedOtp).trim() !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updated = await updatePassword(normalized, hashedPassword);

    await deleteOTPFromCache(normalized);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "User not found for password update.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (err) {
    console.error("resetPasswordWithOTP error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// ===================================================================
//  PROFILE
// ===================================================================

/**
 * GET PROFILE (requires protect middleware)
 */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error("getProfile error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// ===================================================================
//  ADMIN: GET ALL USERS (THIS FIXES /api/users/all NEED)
// ===================================================================

/**
 * GET ALL USERS (admin/super-admin)
 * NOTE: protect + restrictTo should guard this in routes.
 */
export const getAllUsers = async (req, res) => {
  try {
    // If you want: filter by role via query (?role=PATIENT)
    const role = String(req.query?.role || "").trim().toUpperCase();
    const filter = role ? { role } : {};

    // IMPORTANT:
    // Here we use Mongoose directly because your service layer doesn't have listAll yet.
    // If you want, I can move it into userService.
    const User = (await import("../models/userModel.js")).default;

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (err) {
    console.error("getAllUsers error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
