import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

/* =========================================================
   Helpers
========================================================= */
const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2) return null;

  const token = parts[1];
  // Filter out common frontend "empty" strings
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

/* =========================================================
   ✅ AUTH PROTECT (Full Access)
   - Requires purpose: "AUTH"
========================================================= */
export const protect = async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ success: false, message: "No token provided." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🛡️ SECURITY GATE: Only allow full AUTH tokens
    if (decoded.purpose !== "AUTH") {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied. Please complete payment and login again." 
      });
    }

    const user = await User.findById(decoded.id).select("-password").lean();
    if (!user) return res.status(401).json({ success: false, message: "User no longer exists." });

    req.user = {
      ...user,
      id: String(user._id),
      tenantId: user.tenantId ? String(user.tenantId) : (decoded.tenantId ? String(decoded.tenantId) : null),
    };

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: jwtErrorMessage(err) });
  }
};

/* =========================================================
   ✅ PAYMENT PROTECT (Restricted Access)
   - Allows purpose: "PAYMENT" or "AUTH"
========================================================= */
export const protectPayment = async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ success: false, message: "No token provided." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🛡️ SECURITY GATE: Allow Payment OR Auth (in case an active user is renewing/upgrading)
    if (!["PAYMENT", "AUTH"].includes(decoded.purpose)) {
      return res.status(403).json({ success: false, message: "Invalid token for payment activation." });
    }

    const user = await User.findById(decoded.id).select("-password").lean();
    if (!user) return res.status(401).json({ success: false, message: "User no longer exists." });

    req.user = {
      ...user,
      id: String(user._id),
      tenantId: user.tenantId ? String(user.tenantId) : (decoded.tenantId ? String(decoded.tenantId) : null),
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
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: Required permissions missing.",
      });
    }
    next();
  };
};

export const authorize = (...roles) => restrictTo(...roles);