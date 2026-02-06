import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

/* =========================================================
   Helpers
========================================================= */
const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  if (!authHeader?.startsWith("Bearer ")) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2) return null;

  const token = parts[1];
  if (!token || ["null", "undefined", "[object Object]"].includes(token)) return null;

  return token;
};

const jwtErrorMessage = (err) => {
  const msg = String(err?.message || "").toLowerCase();
  if (msg.includes("jwt expired")) return "Session expired. Please login again.";
  if (msg.includes("jwt malformed")) return "Invalid security token format.";
  if (msg.includes("invalid signature")) return "Security signature mismatch.";
  return "Authentication failed.";
};

const normalizeRole = (v) => String(v || "").trim().toUpperCase();

/* =========================================================
   ✅ BASE VERIFY
   - Verifies token
   - Attaches req.user from DB
   - Does NOT enforce purpose
========================================================= */
const verifyAndAttachUser = async (req) => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");

  const token = getBearerToken(req);
  if (!token) {
    const e = new Error("No token provided.");
    e.statusCode = 401;
    throw e;
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  const user = await User.findById(decoded.id).select("-password").lean();
  if (!user) {
    const e = new Error("User no longer exists.");
    e.statusCode = 401;
    throw e;
  }

  req.user = {
    ...user,
    id: String(user._id),
    role: normalizeRole(user.role || decoded.role),
    tenantId: user.tenantId
      ? String(user.tenantId)
      : decoded.tenantId
        ? String(decoded.tenantId)
        : null,
    tokenPurpose: decoded.purpose || null,
  };

  return decoded;
};

/* =========================================================
   ✅ PROTECT (Flexible)
   - Used for: Patient booking, patient views, general auth routes
   - Accepts tokens even if purpose is missing
========================================================= */
export const protect = async (req, res, next) => {
  try {
    await verifyAndAttachUser(req);
    next();
  } catch (err) {
    return res
      .status(err.statusCode || 401)
      .json({ success: false, message: err.message || jwtErrorMessage(err) });
  }
};

/* =========================================================
   ✅ PROTECT AUTH (Strict)
   - Used for: Dashboard/Admin secured routes
   - Requires purpose === "AUTH"
========================================================= */
export const protectAuth = async (req, res, next) => {
  try {
    const decoded = await verifyAndAttachUser(req);

    if (decoded.purpose !== "AUTH") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Please complete payment and login again.",
      });
    }

    next();
  } catch (err) {
    return res
      .status(err.statusCode || 401)
      .json({ success: false, message: err.message || jwtErrorMessage(err) });
  }
};

/* =========================================================
   ✅ PAYMENT PROTECT
   - Used for: /create-order, /verify, /manual
   - Allows purpose: "PAYMENT" or "AUTH"
========================================================= */
export const protectPayment = async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ success: false, message: "No token provided." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!["PAYMENT", "AUTH"].includes(decoded.purpose)) {
      return res.status(403).json({
        success: false,
        message: "Invalid token for payment activation.",
      });
    }

    const user = await User.findOne({
      $or: [{ _id: decoded.id }, { email: decoded.email }],
    })
      .select("-password")
      .lean();

    req.user = user
      ? {
          ...user,
          id: String(user._id),
          role: normalizeRole(user.role || decoded.role),
          tenantId: user.tenantId
            ? String(user.tenantId)
            : decoded.tenantId
              ? String(decoded.tenantId)
              : null,
          tokenPurpose: decoded.purpose || null,
        }
      : {
          email: decoded.email,
          tenantId: decoded.tenantId || null,
          role: normalizeRole(decoded.role || "CLINIC_ADMIN"),
          tokenPurpose: decoded.purpose || null,
        };

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: jwtErrorMessage(err) });
  }
};

/* =========================================================
   ✅ AUTHORIZATION
========================================================= */
export const restrictTo = (...roles) => {
  const allowed = roles.map((r) => normalizeRole(r));
  return (req, res, next) => {
    const role = normalizeRole(req.user?.role);
    if (!req.user || !allowed.includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: Required permissions missing.",
      });
    }
    next();
  };
};

export const authorize = (...roles) => restrictTo(...roles);
