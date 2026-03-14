import User from "../models/userModel.js";
import { createClient } from "redis";

let redisClient = null;
let redisInitPromise = null;
let useRedis = true;
const memoryCache = new Map();

export const getRedisClient = () => redisClient;

const memorySetEx = (key, seconds, value) => {
  if (memoryCache.has(key)) clearTimeout(memoryCache.get(key).timeout);
  const timeout = setTimeout(() => memoryCache.delete(key), seconds * 1000);
  memoryCache.set(key, { value, timeout });
};

const memoryGet = (key) => memoryCache.has(key) ? memoryCache.get(key).value : null;

const memoryDel = (key) => {
  if (memoryCache.has(key)) {
    clearTimeout(memoryCache.get(key).timeout);
    memoryCache.delete(key);
  }
};

const cacheSetEx = async (key, seconds, value) => {
  if (useRedis && !redisClient?.isOpen) await initRedis();
  if (useRedis && redisClient?.isOpen) {
    try { return await redisClient.setEx(key, seconds, value); } catch (e) { console.error("Redis setEx error:", e); }
  }
  memorySetEx(key, seconds, value);
};

const cacheGet = async (key) => {
  if (useRedis && !redisClient?.isOpen) await initRedis();
  if (useRedis && redisClient?.isOpen) {
    try { 
      const val = await redisClient.get(key); 
      if (val !== null) return val;
    } catch (e) { console.error("Redis get error:", e); }
  }
  return memoryGet(key);
};

const cacheDel = async (key) => {
  if (useRedis && !redisClient?.isOpen) await initRedis();
  if (useRedis && redisClient?.isOpen) {
    try { return await redisClient.del(key); } catch (e) { console.error("Redis del error:", e); }
  }
  return memoryDel(key);
};

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
          connectTimeout: 5000,
          reconnectStrategy: false,
        }
      });

      redisClient.on("error", (err) => console.log("❌ Redis Error:", err.message));
      redisClient.on("connect", () => console.log("🟡 Redis Connecting..."));
      redisClient.on("ready", () => console.log("✅ Redis Ready"));
      redisClient.on("reconnecting", () => console.log("♻️ Redis Reconnecting..."));
      redisClient.on("end", () => console.log("🔴 Redis Connection Closed"));

      await redisClient.connect();
      useRedis = true;
      return redisClient;
    } catch (err) {
      // if connect fails, clear broken client
      console.error("❌ Redis connect failed, switching to in-memory fallback");
      redisClient = null;
      useRedis = false;
      return null;
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
  const e = normalizeEmail(email);
  const key = `reg_otp:${e}`;

  // ensure object is stored
  const safeData =
    data && typeof data === "object"
      ? data
      : { value: data };

  await cacheSetEx(key, 600, JSON.stringify(safeData));
};

export const getTempRegistration = async (email) => {
  const e = normalizeEmail(email);
  const raw = await cacheGet(`reg_otp:${e}`);

  return raw ? safeJsonParse(raw) : null;
};

export const deleteTempRegistration = async (email) => {
  const e = normalizeEmail(email);
  await cacheDel(`reg_otp:${e}`);
};

/**
 * Save OTP (TTL 5 minutes / 300s)
 */
export const saveOTPToCache = async (email, otp) => {
  const e = normalizeEmail(email);
  const value = typeof otp === "string" ? otp : String(otp);

  await cacheSetEx(`otp:${e}`, 300, value);
};

export const getOTPFromCache = async (email) => {
  const e = normalizeEmail(email);
  return await cacheGet(`otp:${e}`);
};

export const deleteOTPFromCache = async (email) => {
  const e = normalizeEmail(email);
  await cacheDel(`otp:${e}`);
};
