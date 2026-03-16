import User from "../models/userModel.js";
import TempRegistration from "../models/tempRegistrationModel.js";
import OTP from "../models/otpModel.js";
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
        socket: {
          connectTimeout: 5000, // 5s timeout for connection
          reconnectStrategy: (retries) => {
            if (retries > 3) return new Error("Redis retry limit reached");
            return Math.min(retries * 50, 500);
          }
        }
      });

      redisClient.on("error", (err) => console.log("❌ Redis Error:", err.message));
      redisClient.on("connect", () => console.log("🟡 Redis Connecting..."));
      redisClient.on("ready", () => console.log("✅ Redis Ready"));
      redisClient.on("reconnecting", () => console.log("♻️ Redis Reconnecting..."));
      redisClient.on("end", () => console.log("🔴 Redis Connection Closed"));

      // Wrap connect in a timeout just in case the socket option isn't enough
      const connectPromise = redisClient.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Redis connection timeout")), 6000)
      );

      await Promise.race([connectPromise, timeoutPromise]);
      return redisClient;
    } catch (err) {
      console.error("❌ Redis init failed:", err.message);
      // Clean up if it failed
      try {
        if (redisClient) await redisClient.disconnect().catch(() => {});
      } catch {}
      redisClient = null;
      throw err;
    } finally {
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
  const e = normalizeEmail(email);
  const key = `reg_otp:${e}`;
  const safeData = data && typeof data === "object" ? data : { value: data };

  try {
    if (!redisClient?.isOpen) await initRedis().catch(() => {});
    if (redisClient?.isOpen) {
      await redisClient.setEx(key, 600, JSON.stringify(safeData));
      return;
    }
  } catch (err) {
    console.error("Redis saveTempRegistration fallback to Mongo:", err.message);
  }

  // MongoDB Fallback
  await TempRegistration.findOneAndUpdate(
    { email: e },
    { data: safeData, createdAt: new Date() },
    { upsert: true, new: true }
  );
};

export const getTempRegistration = async (email) => {
  const e = normalizeEmail(email);

  try {
    if (!redisClient?.isOpen) await initRedis().catch(() => {});
    if (redisClient?.isOpen) {
      const raw = await redisClient.get(`reg_otp:${e}`);
      if (raw) return safeJsonParse(raw);
    }
  } catch (err) {
    console.error("Redis getTempRegistration fallback to Mongo:", err.message);
  }

  // MongoDB Fallback
  const doc = await TempRegistration.findOne({ email: e });
  return doc ? doc.data : null;
};

export const deleteTempRegistration = async (email) => {
  const e = normalizeEmail(email);

  try {
    if (!redisClient?.isOpen) await initRedis().catch(() => {});
    if (redisClient?.isOpen) {
      await redisClient.del(`reg_otp:${e}`);
    }
  } catch (err) {
    console.error("Redis deleteTempRegistration error:", err.message);
  }

  // Always try Mongo too for safety
  await TempRegistration.deleteOne({ email: e });
};

/**
 * Save OTP (TTL 5 minutes / 300s)
 */
export const saveOTPToCache = async (email, otp) => {
  const e = normalizeEmail(email);
  const value = typeof otp === "string" ? otp : String(otp);

  try {
    if (!redisClient?.isOpen) await initRedis().catch(() => {});
    if (redisClient?.isOpen) {
      await redisClient.setEx(`otp:${e}`, 300, value);
      return;
    }
  } catch (err) {
    console.error("Redis saveOTPToCache fallback to Mongo:", err.message);
  }

  // MongoDB Fallback
  await OTP.findOneAndUpdate(
    { email: e },
    { otp: value, createdAt: new Date() },
    { upsert: true, new: true }
  );
};

export const getOTPFromCache = async (email) => {
  const e = normalizeEmail(email);

  try {
    if (!redisClient?.isOpen) await initRedis().catch(() => {});
    if (redisClient?.isOpen) {
      const val = await redisClient.get(`otp:${e}`);
      if (val) return val;
    }
  } catch (err) {
    console.error("Redis getOTPFromCache fallback to Mongo:", err.message);
  }

  // MongoDB Fallback
  const doc = await OTP.findOne({ email: e });
  return doc ? doc.otp : null;
};

export const deleteOTPFromCache = async (email) => {
  const e = normalizeEmail(email);

  try {
    if (!redisClient?.isOpen) await initRedis().catch(() => {});
    if (redisClient?.isOpen) {
      await redisClient.del(`otp:${e}`);
    }
  } catch (err) {
    console.error("Redis deleteOTPFromCache error:", err.message);
  }

  // Always try Mongo too
  await OTP.deleteOne({ email: e });
};
