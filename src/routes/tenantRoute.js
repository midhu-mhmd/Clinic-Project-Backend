import express from "express";
import mongoose from "mongoose";
import upload from "../middlewares/uploadMiddleware.js";

import {
   createTenant,
   verifyEmailOTP,
   resendOTP,
   loginTenant,
   forgotPasswordClinic,
   resetPasswordClinic,
   changePassword,
   getDirectory,
   getClinicById,
   getStats,
   getPlanUsage,
   getProfile,
   updateProfile,
   uploadImage,
   getClinicDoctorsPublic,
   activateSubscriptionAfterPayment,
   getSecuritySettings,
   updateSecuritySettings,
   updatePlan,
   cancelSubscription as cancelSub,
   pauseSubscription as pauseSub,
   applyCoupon as applyCoup,
   updateCycle,
   manualOverride,
} from "../controllers/tenantController.js";

import { protect, authorize, protectPayment } from "../middlewares/authMiddleware.js";

const router = express.Router();

// ✅ Helper: Prevent Crashing on Bad IDs
// If the ID isn't a valid Mongo ID, return 404 immediately instead of crashing the DB.
const validateId = (req, res, next) => {
   if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: "Resource not found or invalid ID." });
   }
   next();
};

/* =========================================================
   1. AUTH & ACCOUNT ROUTES (Static Paths First)
========================================================= */
router.post("/register", createTenant);
router.post("/login", loginTenant);
router.post("/verify-otp", verifyEmailOTP);
router.post("/resend-otp", resendOTP);
router.post("/forgot-password", forgotPasswordClinic);
router.post("/reset-password", resetPasswordClinic);

/* =========================================================
   2. PROTECTED ADMIN ROUTES
========================================================= */
router.get("/stats", protect, authorize("CLINIC_ADMIN"), getStats);
router.get("/plan-usage", protect, authorize("CLINIC_ADMIN"), getPlanUsage);
router.get("/profile", protect, authorize("CLINIC_ADMIN"), getProfile);
router.patch("/profile", protect, authorize("CLINIC_ADMIN"), updateProfile);
router.put("/change-password", protect, authorize("CLINIC_ADMIN"), changePassword);
router.post("/upload-image", protect, authorize("CLINIC_ADMIN"), upload.single("image"), uploadImage);
router.get("/security", protect, authorize("CLINIC_ADMIN"), getSecuritySettings);
router.put("/security", protect, authorize("CLINIC_ADMIN"), updateSecuritySettings);

/* =========================================================
   3. PAYMENT FLOW
========================================================= */
router.post(
   "/subscription/activate",
   protectPayment,
   authorize("CLINIC_ADMIN"),
   activateSubscriptionAfterPayment
);

/* =========================================================
   4. SUPERADMIN SUBSCRIPTION MANAGEMENT
========================================================= */
router.patch("/subscription/plan/:id", protect, authorize("SUPER_ADMIN"), updatePlan);
router.patch("/subscription/cancel/:id", protect, authorize("SUPER_ADMIN"), cancelSub);
router.patch("/subscription/pause/:id", protect, authorize("SUPER_ADMIN"), pauseSub);
router.patch("/subscription/coupon/:id", protect, authorize("SUPER_ADMIN"), applyCoup);
router.patch("/subscription/cycle/:id", protect, authorize("SUPER_ADMIN"), updateCycle);
router.post("/subscription/override/:id", protect, authorize("SUPER_ADMIN"), manualOverride);

/* =========================================================
   5. PUBLIC DIRECTORY & PROFILE
========================================================= */
router.get("/all", getDirectory);

// This is specific, so it goes ABOVE the generic /:id
router.get("/doctors/public/:clinicId", getClinicDoctorsPublic);

/* =========================================================
   5. DYNAMIC ROUTES (MUST BE LAST)
========================================================= */
// ✅ FIXED: Added validateId to stop "register" or "favicon" from crashing Mongoose
router.get("/:id", validateId, getClinicById);

export default router;