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

// --- CONFIG & INITIALIZATION ---
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
});

redisClient.on("error", (err) => console.error("❌ Redis Client Error:", err));
await redisClient.connect();

const getTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// --- NEW HELPER: WELCOME EMAIL ---
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Welcome to our Platform!",
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 40px; background-color: #FAF9F6; border: 1px solid #eee;">
          <h1 style="color: #2D302D; font-weight: 300;">Welcome, ${name.split(' ')[0]}!</h1>
          <p style="color: #444; line-height: 1.6;">We're thrilled to have you here. Your account is now verified and ready to use.</p>
          <div style="margin-top: 30px; padding: 20px; background-color: #ffffff; border-radius: 4px;">
            <p style="margin: 0; color: #8DAA9D; font-weight: bold;">Getting Started:</p>
            <ul style="color: #666; font-size: 14px;">
              <li>Complete your profile</li>
              <li>Explore the dashboard</li>
              <li>Secure your data</li>
            </ul>
          </div>
          <p style="font-size: 12px; color: #999; margin-top: 40px;">If you didn't create this account, please ignore this email.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("❌ Welcome Email Failed:", err.message);
    // We don't throw an error here to ensure the user registration still completes even if the email fails
  }
};

// --- HELPER: GENERATE TOKEN ---
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// --- REGISTRATION FLOW ---

export const sendRegisterOTP = async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const existingUser = await findUserByEmail(email);
    if (existingUser) return res.status(409).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const tempData = { name, email, password: hashedPassword, otp };
    await redisClient.setEx(`reg_otp:${email}`, 600, JSON.stringify(tempData));

    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify your Account",
      html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
               <h2 style="color: #2D302D;">Verification Code</h2>
               <p>Your code is: <b style="font-size: 24px; color: #8DAA9D;">${otp}</b></p>
               <p>This code expires in 10 minutes.</p>
             </div>`,
    });

    res.status(200).json({ message: "OTP sent to email" });
  } catch (err) {
    res.status(500).json({ message: "System error: " + err.message });
  }
};

export const verifyRegisterOTP = async (req, res) => {
  const { email, otp } = req.body;
  try {
    const storedDataString = await redisClient.get(`reg_otp:${email}`);
    if (!storedDataString) return res.status(400).json({ message: "OTP expired" });

    const storedData = JSON.parse(storedDataString);
    if (storedData.otp !== otp) return res.status(400).json({ message: "Invalid Code" });

    const user = await createUser({
      name: storedData.name,
      email: storedData.email,
      password: storedData.password,
      authProvider: "local",
      role: "PATIENT",
    });

    // --- TRIGGER WELCOME EMAIL ---
    await sendWelcomeEmail(user.email, user.name);

    const token = generateToken(user);
    await redisClient.del(`reg_otp:${email}`);

    res.status(201).json({
      message: "Account verified successfully",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- LOGIN & AUTH ---

// controllers/userController.js
// controllers/userController.js

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // This now fetches the password thanks to the service change above
    const user = await findUserByEmail(email.toLowerCase());

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if the account was created via Google
    if (user.authProvider === "google") {
      return res.status(400).json({
        message: "This account is linked with Google. Please use Google Sign-In."
      });
    }

    // Safety check: if for some reason a local user has no password
    if (!user.password) {
       return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user);

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

  } catch (err) {
    console.error("LOGIN ERROR ❌", err);
    res.status(500).json({ message: "Login failed" });
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

    if (!user) {
      const hashedPassword = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10);
      user = await createUser({ name, email, password: hashedPassword, authProvider: "google", role: "PATIENT" });
      
      // --- TRIGGER WELCOME EMAIL FOR NEW GOOGLE USER ---
      await sendWelcomeEmail(user.email, user.name);
    }

    const token = generateToken(user);
    res.status(200).json({ message: "Google login successful", token, user: { name: user.name, email: user.email, role: user.role, id: user._id } });
  } catch (error) {
    res.status(401).json({ message: "Google authentication failed" });
  }
};

// --- FORGOT PASSWORD FLOW ---

export const requestOTP = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redisClient.setEx(`otp:${email}`, 300, otp);

    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Code",
      text: `Your verification code is: ${otp}. It expires in 5 minutes.`,
    });

    res.status(200).json({ message: "OTP sent to your email" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
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
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};