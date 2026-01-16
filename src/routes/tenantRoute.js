import express from "express";
import { 
  createTenant, 
  verifyEmailOTP, 
  resendOTP, // Added the resend controller import
  getDirectory, 
  getClinicById,
  getMyDashboard, 
  updateProfile 
} from "../controllers/tenantController.js";
import { auth } from "../middlewares/authMiddleware.js";

const tenantRoute = express.Router();

/* =======================
   PUBLIC ROUTES
======================= */

// 1. Register a new Clinic (Triggers initial OTP)
tenantRoute.post("/clinic-register", createTenant);

// 2. Verify Email via OTP 
tenantRoute.post("/verify-otp", verifyEmailOTP);

// 3. Resend OTP (The new endpoint for your "Resend" button)
tenantRoute.post("/resend-otp", resendOTP);

// 4. Fetch all public clinics
tenantRoute.get("/all", getDirectory);


/* =======================
   PROTECTED ROUTES
======================= */

tenantRoute.get("/dashboard", auth, getMyDashboard);
tenantRoute.put("/update", auth, updateProfile);


/* =======================
   DYNAMIC ROUTES (LAST)
======================= */

tenantRoute.get("/:id", getClinicById);

export default tenantRoute;