import User from "../models/userModel.js";
import { createClient } from "redis";

const redisClient = createClient();

redisClient.on("error", (err) => console.log("❌ Redis Client Error", err));
redisClient.on("connect", () => console.log("✅ Redis Connected Successfully"));

await redisClient.connect();

export const createUser = async (data) => {
  return await User.create(data);
};

export const findUserByEmail = async (email) => {
  return await User.findOne({ email });
};

export const findUserById = async (id) => {
  return await User.findById(id).select("-password");
};

//  OTP & RESET LOGIC

export const saveOTPToCache = async (email, otp) => {
  try {
    if (!redisClient.isOpen) await redisClient.connect();
    await redisClient.setEx(`otp:${email}`, 300, otp);
    console.log(`🔑 OTP stored in Redis for ${email}`);
  } catch (err) {
    console.error("Redis Save Error:", err);
    throw err;
  }
};

export const getOTPFromCache = async (email) => {
  if (!redisClient.isOpen) await redisClient.connect();
  return await redisClient.get(`otp:${email}`);
};

export const deleteOTPFromCache = async (email) => {
  await redisClient.del(`otp:${email}`);
};

export const updatePassword = async (email, hashedPassword) => {
  return await User.findOneAndUpdate(
    { email },
    { password: hashedPassword },
    { new: true }
  );
};
