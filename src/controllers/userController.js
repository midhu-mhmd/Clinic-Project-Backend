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
} from "../services/userService.js";

//  CONFIG & INITIALIZATION

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// 1. Initialize Redis (Docker)
const redisClient = createClient({
  url: "redis://127.0.0.1:6379",
});

redisClient.on("error", (err) => console.error("❌ Redis Client Error:", err));
redisClient.on("connect", () =>
  console.log("✅ Connected to Redis successfully!")
);

// Wait for Redis connection
await redisClient.connect();

// 2. Transporter Helper
const getTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

//  FORGOT PASSWORD (OTP)

export const requestOTP = async (req, res) => {
  const { email } = req.body;
  console.log("Step 1: Received request for", email);

  try {
    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("Step 2: OTP generated");

    // Store in Redis
    await redisClient.setEx(`otp:${email}`, 300, otp);
    console.log("Step 3 & 4: Stored in Redis");

    // Send Email
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Code",
      text: `Your verification code is: ${otp}. It expires in 5 minutes.`,
    });

    console.log("Step 5 & 6: Email sent:", info.messageId);
    res.status(200).json({ message: "OTP sent to your email" });
  } catch (err) {
    console.error("❌ CRITICAL ERROR:", err);
    res.status(500).json({ message: "System error: " + err.message });
  }
};

//  RESET PASSWORD

export const resetPasswordWithOTP = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    const cachedOtp = await redisClient.get(`otp:${email}`);

    if (!cachedOtp || cachedOtp !== otp) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ message: "User not found" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update Password
    user.password = hashedPassword;
    await user.save();

    // Cleanup Redis
    await redisClient.del(`otp:${email}`);

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//  NORMAL REGISTER

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await createUser({
      name,
      email,
      password: hashedPassword,
      authProvider: "local",
      role: "PATIENT",
    });

    res.status(201).json({
      message: "User registered successfully",
      userId: user._id,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//  NORMAL LOGIN

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 🚫 Block Google users from password login
    if (user.authProvider === "google") {
      return res.status(401).json({
        message: "Use Google login for this account",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//  GOOGLE LOGIN

export const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name } = payload;

    let user = await findUserByEmail(email);

    if (!user) {
      // 🔐 Random + hashed password
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      user = await createUser({
        name,
        email,
        password: hashedPassword,
        authProvider: "google",
        role: "PATIENT",
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Google login successful",
      token,
    });
  } catch (error) {
    console.error("Google Auth Error:", error);
    res.status(401).json({ message: "Google authentication failed" });
  }
};

//  GET PROFILE

export const getProfile = async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
