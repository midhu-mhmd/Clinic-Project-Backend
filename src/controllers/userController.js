import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { createClient } from "redis";
import nodemailer from "nodemailer";

import {
  createUser,
  findUserByEmail,
  findUserById,
  updatePassword,
} from "../services/userService.js";

// Google Client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Redis Client
const redisClient = createClient({ url: process.env.REDIS_URL || "redis://127.0.0.1:6379" });
redisClient.on("error", (err) => console.error("❌ Redis Error:", err));
(async () => { if (!redisClient.isOpen) await redisClient.connect(); })();

// Nodemailer transporter
const getTransporter = () => nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// Send welcome email safely
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Welcome!",
      html: `<p>Hello ${name.split(' ')[0]}, welcome to our platform!</p>`,
    });
  } catch (err) { console.error("❌ Welcome Email Failed:", err.message); }
};

// Token generation
const generateToken = (user) => jwt.sign(
  { id: user._id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

// -----------------------
// REGISTRATION FLOW
// -----------------------
export const sendRegisterOTP = async (req, res) => {
  const { name, email, password } = req.body;
  try {
    if (await findUserByEmail(email)) return res.status(409).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await redisClient.setEx(`reg_otp:${email}`, 600, JSON.stringify({ name, email, password: hashedPassword, otp }));

    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify your Account",
      html: `<p>Your OTP is <b>${otp}</b> (expires in 10 min)</p>`,
    });

    res.status(200).json({ message: "OTP sent to email" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const verifyRegisterOTP = async (req, res) => {
  const { email, otp } = req.body;
  try {
    const stored = await redisClient.get(`reg_otp:${email}`);
    if (!stored) return res.status(400).json({ message: "OTP expired" });

    const { name, password, otp: storedOtp } = JSON.parse(stored);
    if (otp !== storedOtp) return res.status(400).json({ message: "Invalid OTP" });

    const user = await createUser({ name, email, password, authProvider: "local", role: "PATIENT" });
    await sendWelcomeEmail(email, name);

    const token = generateToken(user);
    await redisClient.del(`reg_otp:${email}`);

    res.status(201).json({ success: true, message: "Account verified", token, user: { id: user._id, name, email, role: user.role } });
  } catch (err) {
    console.error("OTP Verification Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// -----------------------
// LOGIN FLOW
// -----------------------
export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const user = await findUserByEmail(email.toLowerCase());
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    if (user.authProvider === "google") return res.status(400).json({ message: "Use Google Sign-In" });
    if (!user.password || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken(user);
    res.status(200).json({ message: "Login successful", token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

export const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({ audience: process.env.GOOGLE_CLIENT_ID, idToken: credential });
    const { email, name } = ticket.getPayload();

    let user = await findUserByEmail(email);
    if (!user) {
      const hashedPassword = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10);
      user = await createUser({ name, email, password: hashedPassword, authProvider: "google", role: "PATIENT" });
      await sendWelcomeEmail(email, name);
    }

    const token = generateToken(user);
    res.status(200).json({ message: "Google login successful", token, user: { id: user._id, name, email, role: user.role } });
  } catch (err) { res.status(401).json({ message: "Google authentication failed" }); }
};

// -----------------------
// PASSWORD RESET FLOW
// -----------------------
export const requestOTP = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redisClient.setEx(`otp:${email}`, 300, otp);

    await getTransporter().sendMail({ from: process.env.EMAIL_USER, to: email, subject: "Password Reset OTP", text: `OTP: ${otp}` });
    res.status(200).json({ message: "OTP sent to email" });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

export const resetPasswordWithOTP = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const cachedOtp = await redisClient.get(`otp:${email}`);
    if (!cachedOtp || cachedOtp !== otp) return res.status(400).json({ message: "Invalid or expired OTP" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await updatePassword(email, hashedPassword);
    await redisClient.del(`otp:${email}`);

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// -----------------------
// PROFILE
// -----------------------
export const getProfile = async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
