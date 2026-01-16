import User from "../models/userModel.js";
import { createClient } from "redis";

// =====================
// REDIS CLIENT INIT
// =====================
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
});

redisClient.on("error", (err) => console.log("❌ Redis Client Error:", err));
redisClient.on("connect", () => console.log("✅ Redis Connected Successfully"));

// Async IIFE to connect Redis safely
(async () => {
  try {
    if (!redisClient.isOpen) await redisClient.connect();
  } catch (err) {
    console.error("Redis Connection Failed:", err);
  }
})();

// =====================
// USER DATABASE HELPERS
// =====================

export const createUser = async (data) => {
  return await User.create(data);
};

/**
 * Get user by email including password (for login / bcrypt compare)
 */
export const findUserByEmail = async (email) => {
  return await User.findOne({ email }).select("+password");
};

/**
 * Get user by ID, without password
 */
export const findUserById = async (id) => {
  return await User.findById(id).select("-password");
};

/**
 * Update user password
 */
export const updatePassword = async (email, hashedPassword) => {
  return await User.findOneAndUpdate(
    { email },
    { password: hashedPassword },
    { new: true }
  );
};

// =====================
// TEMP REGISTRATION / REDIS HELPERS
// =====================

/**
 * Store temporary registration info in Redis (10 mins)
 */
export const saveTempRegistration = async (email, data) => {
  try {
    const key = `reg_otp:${email}`;
    const value = typeof data === "string" ? data : JSON.stringify(data);
    await redisClient.setEx(key, 600, value); // 600 sec = 10 min
    console.log(`📝 Temp registration saved for ${email}`);
  } catch (err) {
    console.error("Redis Save Temp Registration Error:", err);
    throw err;
  }
};

/**
 * Retrieve temporary registration from Redis
 */
export const getTempRegistration = async (email) => {
  try {
    const data = await redisClient.get(`reg_otp:${email}`);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("Redis Get Temp Registration Error:", err);
    throw err;
  }
};

/**
 * Delete temporary registration
 */
export const deleteTempRegistration = async (email) => {
  try {
    await redisClient.del(`reg_otp:${email}`);
  } catch (err) {
    console.error("Redis Delete Temp Registration Error:", err);
  }
};

// =====================
// OTP CACHE HELPERS
// =====================

/**
 * Store OTP in Redis for 5 minutes
 */
export const saveOTPToCache = async (email, otp) => {
  try {
    const value = typeof otp === "string" ? otp : String(otp);
    await redisClient.setEx(`otp:${email}`, 300, value); // 300 sec = 5 min
  } catch (err) {
    console.error("Redis Save OTP Error:", err);
    throw err;
  }
};

/**
 * Retrieve OTP from Redis
 */
export const getOTPFromCache = async (email) => {
  try {
    return await redisClient.get(`otp:${email}`);
  } catch (err) {
    console.error("Redis Get OTP Error:", err);
    throw err;
  }
};

/**
 * Delete OTP from Redis
 */
export const deleteOTPFromCache = async (email) => {
  try {
    await redisClient.del(`otp:${email}`);
  } catch (err) {
    console.error("Redis Delete OTP Error:", err);
  }
};
