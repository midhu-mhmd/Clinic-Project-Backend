import User from "../models/userModel.js";
import { createClient } from "redis";

let redisClient = null;
let redisInitPromise = null;

export const getRedisClient = () => redisClient;

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/**
 * Init Redis (single-flight: prevents parallel connects)
 */
export const initRedis = async () => {
  // already connected
  if (redisClient?.isOpen) return redisClient;

  // connect already in progress
  if (redisInitPromise) return redisInitPromise;

  redisInitPromise = (async () => {
    try {
      redisClient = createClient({
        url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
      });

      redisClient.on("error", (err) => console.log("❌ Redis Error:", err));
      redisClient.on("connect", () => console.log("🟡 Redis Connecting..."));
      redisClient.on("ready", () => console.log("✅ Redis Ready"));
      redisClient.on("reconnecting", () => console.log("♻️ Redis Reconnecting..."));
      redisClient.on("end", () => console.log("🔴 Redis Connection Closed"));

      await redisClient.connect();
      return redisClient;
    } catch (err) {
      // if connect fails, clear broken client
      console.error("❌ Redis connect failed:", err);
      redisClient = null;
      throw err;
    } finally {
      // allow future retry
      redisInitPromise = null;
    }
  })();

  return redisInitPromise;
};

/**
 * Gracefully close redis
 */
export const closeRedis = async () => {
  try {
    if (redisClient?.isOpen) await redisClient.quit();
  } catch (e) {
    console.error("Redis quit failed:", e);
  } finally {
    redisClient = null;
    redisInitPromise = null;
  }
};

/* ---------------- USER HELPERS ---------------- */

export const createUser = async (data) => User.create(data);

export const findUserByEmail = async (email) => {
  return User.findOne({ email: normalizeEmail(email) }).select("+password");
};

export const findUserById = async (id) => {
  return User.findById(id).select("-password");
};

export const updatePassword = async (email, hashedPassword) => {
  return User.findOneAndUpdate(
    { email: normalizeEmail(email) },
    { password: hashedPassword },
    { new: true }
  );
};

/* ---------------- OTP / TEMP REG ---------------- */

/**
 * Save temp registration data (for OTP flow)
 * - always stores JSON
 * - TTL 10 minutes (600s)
 */
export const saveTempRegistration = async (email, data) => {
  if (!redisClient?.isOpen) await initRedis();

  const e = normalizeEmail(email);
  const key = `reg_otp:${e}`;

  // ensure object is stored
  const safeData =
    data && typeof data === "object"
      ? data
      : { value: data };

  await redisClient.setEx(key, 600, JSON.stringify(safeData));
};

export const getTempRegistration = async (email) => {
  if (!redisClient?.isOpen) await initRedis();

  const e = normalizeEmail(email);
  const raw = await redisClient.get(`reg_otp:${e}`);

  return raw ? safeJsonParse(raw) : null;
};

export const deleteTempRegistration = async (email) => {
  if (!redisClient?.isOpen) await initRedis();

  const e = normalizeEmail(email);
  await redisClient.del(`reg_otp:${e}`);
};

/**
 * Save OTP (TTL 5 minutes / 300s)
 */
export const saveOTPToCache = async (email, otp) => {
  if (!redisClient?.isOpen) await initRedis();

  const e = normalizeEmail(email);
  const value = typeof otp === "string" ? otp : String(otp);

  await redisClient.setEx(`otp:${e}`, 300, value);
};

export const getOTPFromCache = async (email) => {
  if (!redisClient?.isOpen) await initRedis();

  const e = normalizeEmail(email);
  return redisClient.get(`otp:${e}`);
};

export const deleteOTPFromCache = async (email) => {
  if (!redisClient?.isOpen) await initRedis();

  const e = normalizeEmail(email);
  await redisClient.del(`otp:${e}`);
};
