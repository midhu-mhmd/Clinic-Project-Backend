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

const getTransporter = () =>
  nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

const generateToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

export const sendRegisterOTP = async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const normalizedEmail = email.toLowerCase();
    if (await findUserByEmail(normalizedEmail)) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await saveTempRegistration(normalizedEmail, {
      name,
      email: normalizedEmail,
      password: hashedPassword,
      otp,
    });

    console.log(`------------------------------`);
    console.log(`🔑 REGISTRATION OTP FOR ${normalizedEmail}: ${otp}`);
    console.log(`------------------------------`);

    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"Sovereign Protocol" <${process.env.EMAIL_USER}>`,
        to: normalizedEmail,
        subject: "Authentication Required | Sovereign",
        html: verifyEmailTemplate(otp),
      });
      res.status(200).json({ message: "OTP sent to email" });
    } catch (mailErr) {
      console.error("📧 Mailer Error (Registration):", mailErr.message);
      res.status(200).json({ message: "OTP generated (Check terminal)" });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const verifyRegisterOTP = async (req, res) => {
  const { email, otp } = req.body;
  try {
    const normalizedEmail = email.toLowerCase();
    const stored = await getTempRegistration(normalizedEmail);

    if (!stored) return res.status(400).json({ message: "OTP expired" });
    if (otp !== stored.otp)
      return res.status(400).json({ message: "Invalid OTP" });

    const user = await createUser({
      name: stored.name,
      email: normalizedEmail,
      password: stored.password,
      authProvider: "local",
      role: "PATIENT",
    });

    const loginLink = "http://localhost:5173/login";
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"Sovereign Protocol" <${process.env.EMAIL_USER}>`,
        to: normalizedEmail,
        subject: "Humanity Verified | Welcome to Sovereign",
        html: welcomeEmailTemplate(stored.name, loginLink),
      });
    } catch (err) {
      console.error("❌ Welcome Email Failed:", err.message);
    }

    const token = generateToken(user);
    await deleteTempRegistration(normalizedEmail);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: normalizedEmail,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await findUserByEmail(email.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    res.status(200).json({
      token: generateToken(user),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({
      audience: process.env.GOOGLE_CLIENT_ID,
      idToken: credential,
    });
    const { email, name } = ticket.getPayload();

    let user = await findUserByEmail(email);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const hashedPassword = await bcrypt.hash(
        crypto.randomBytes(16).toString("hex"),
        10,
      );
      user = await createUser({
        name,
        email,
        password: hashedPassword,
        authProvider: "google",
        role: "PATIENT",
      });

      const loginLink = "http://localhost:5173/login";
      try {
        const transporter = getTransporter(); // Ensure this helper is accessible
        await transporter.sendMail({
          from: `"Sovereign Protocol" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: "Identity Verified | Welcome to Sovereign",
          html: welcomeEmailTemplate(name, loginLink),
        });
      } catch (mailErr) {
        console.error("📧 Google Welcome Mail Failed:", mailErr.message);
      }
    }

    res.status(200).json({
      token: generateToken(user),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      isNewUser,
    });
  } catch (err) {
    res.status(401).json({ message: "Google authentication failed" });
  }
};

export const requestOTP = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await saveOTPToCache(email, otp);

    console.log(`🔑 RESET OTP FOR ${email}: ${otp}`);

    try {
      await getTransporter().sendMail({
        from: `"Sovereign Protocol" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Secure Recovery | Sovereign",
        text: `Your recovery code: ${otp}`,
      });
    } catch (mErr) {
      console.error("📧 Mailer Error:", mErr.message);
    }

    res.status(200).json({ message: "Recovery code processed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const resetPasswordWithOTP = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  
  try {
    // 1. Sanitize the input
    const sanitizedEmail = email.toLowerCase().trim();
    const cachedOtp = await getOTPFromCache(sanitizedEmail);

    // 2. Robust Comparison: Convert both to strings and trim
    if (!cachedOtp || String(cachedOtp).trim() !== String(otp).trim()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // 3. Password Check
    if (!newPassword || newPassword.length < 6) {
       return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await updatePassword(sanitizedEmail, hashedPassword);
    await deleteOTPFromCache(sanitizedEmail);

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
