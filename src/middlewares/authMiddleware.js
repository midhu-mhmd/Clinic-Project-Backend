import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

/**
 * ✅ AUTH PROTECT MIDDLEWARE
 * - Validates Bearer token
 * - Loads user from DB
 * - Resolves tenantId safely (DB first, token fallback)
 */
export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";

    // 1) Must be "Bearer <token>"
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    // 2) Extract token
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    // 3) Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4) Load user from DB
    const user = await User.findById(decoded.id).select("-password").lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    /**
     * ✅ Tenant Resolution Rule:
     * - DB tenantId is source of truth
     * - If DB tenantId missing, fallback to token tenantId
     * - Avoid overwriting DB tenantId with null from token
     */
    const resolvedTenantId = user.tenantId || decoded.tenantId || null;

    // 5) Attach user to request
    req.user = {
      ...user,
      tenantId: resolvedTenantId,
    };

    return next();
  } catch (err) {
    console.error("protect middleware error:", err.message);

    return res.status(401).json({
      success: false,
      message: "Not authorized",
    });
  }
};

/**
 * ✅ ROLE BASED ACCESS CONTROL
 * Usage:
 * restrictTo("CLINIC_ADMIN", "STAFF")
 */
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    return next();
  };
};

/**
 * ✅ Optional alias (same as restrictTo)
 */
export const authorize = (...roles) => restrictTo(...roles);
