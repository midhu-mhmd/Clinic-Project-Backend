import User from "../models/userModel.js";
import { createClient } from "redis";

// Initialize Redis
const redisClient = createClient({
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379"
});

redisClient.on("error", (err) => console.log("❌ Redis Client Error", err));
redisClient.on("connect", () => console.log("✅ Redis Connected Successfully"));

if (!redisClient.isOpen) {
    await redisClient.connect();
}

// --- DATABASE HELPERS ---

export const createUser = async (data) => {
  return await User.create(data);
};

/**
 * FIX: We must use .select("+password") here.
 * Because the model has 'select: false', Mongoose normally hides the password.
 * Without this, bcrypt.compare receives 'undefined' and crashes (Error 500).
 */
export const findUserByEmail = async (email) => {
  return await User.findOne({ email }).select("+password");
};

export const findUserById = async (id) => {
  return await User.findById(id).select("-password");
};

export const updatePassword = async (email, hashedPassword) => {
  return await User.findOneAndUpdate(
    { email },
    { password: hashedPassword },
    { new: true }
  );
};

// --- REDIS CACHE HELPERS ---

export const saveTempRegistration = async (email, data) => {
  try {
    const key = `reg_otp:${email}`;
    // Ensure we are storing a string
    const value = typeof data === 'string' ? data : JSON.stringify(data); 
    await redisClient.setEx(key, 600, value);
    console.log(`📝 Temp User Data stored in Redis for ${email}`);
  } catch (err) {
    console.error("Redis Save Error:", err);
    throw err;
  }
};

export const getTempRegistration = async (email) => {
  try {
    const data = await redisClient.get(`reg_otp:${email}`);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("Redis Get Error:", err);
    throw err;
  }
};

export const deleteTempRegistration = async (email) => {
  await redisClient.del(`reg_otp:${email}`);
};

// --- OTP CACHE HELPERS ---

export const saveOTPToCache = async (email, otp) => {
  await redisClient.setEx(`otp:${email}`, 300, otp);
};

export const getOTPFromCache = async (email) => {
  return await redisClient.get(`otp:${email}`);
};

export const deleteOTPFromCache = async (email) => {
  await redisClient.del(`otp:${email}`);
};