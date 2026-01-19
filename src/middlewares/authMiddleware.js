import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

// Rename this from 'auth' to 'protect' to match your router
export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user and tenantId
      req.user = await User.findById(decoded.id).select("-password").lean();

      if (!req.user) {
        return res.status(401).json({ success: false, message: "User not found" });
      }

      // Inject tenantId from token into the user object
      req.user.tenantId = decoded.tenantId || null;

      next();
    } catch (err) {
      return res.status(401).json({ success: false, message: "Not authorized" });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    next();
  };
};