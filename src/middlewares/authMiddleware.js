import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-password").lean();

      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "User not found" });
      }

      req.user.tenantId = decoded.tenantId || null;

      next();
    } catch (err) {
      return res
        .status(401)
        .json({ success: false, message: "Not authorized" });
    }
  }

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "No token provided" });
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
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    // roles is an array e.g., ['admin', 'staff']
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }
    next();
  };
};
