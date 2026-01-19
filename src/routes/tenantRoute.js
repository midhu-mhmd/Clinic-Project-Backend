import express from "express";
const router = express.Router();

import { 
  createTenant, 
  verifyEmailOTP, 
  resendOTP,
  loginTenant,
  forgotPasswordClinic,
  resetPasswordClinic,
  getDirectory, 
  getClinicById,
  getMyDashboard, 
  updateProfile,
  addDoctor,
  updateDoctor,  // Added this
  deleteDoctor,  // Added this
  getMyDoctors,
  getClinicDoctorsPublic
} from "../controllers/tenantController.js";

import { protect, authorize } from "../middlewares/authMiddleware.js";

// --- PUBLIC AUTH ---
router.post("/register", createTenant);
router.post("/login", loginTenant);
router.post("/verify-otp", verifyEmailOTP);
router.post("/resend-otp", resendOTP);
router.post("/forgot-password", forgotPasswordClinic);
router.post("/reset-password", resetPasswordClinic);

// --- PUBLIC DATA ---
router.get("/all", getDirectory); 
router.get("/doctors/public/:clinicId", getClinicDoctorsPublic);

// --- PROTECTED CLINIC ADMIN ROUTES ---
router.get("/dashboard", protect, authorize("CLINIC_ADMIN"), getMyDashboard);
router.put("/update", protect, authorize("CLINIC_ADMIN"), updateProfile);

// --- PRACTITIONER (DOCTOR) MANAGEMENT ---
// These routes handle the CRUD for doctors within a specific clinic
router.post("/doctors", protect, authorize("CLINIC_ADMIN"), addDoctor);
router.get("/doctors", protect, authorize("CLINIC_ADMIN"), getMyDoctors);
router.put("/doctors/:id", protect, authorize("CLINIC_ADMIN"), updateDoctor);    // For Edits
router.delete("/doctors/:id", protect, authorize("CLINIC_ADMIN"), deleteDoctor); // For Soft Delete

// --- DYNAMIC ROUTES (Always Last) ---
router.get("/:id", getClinicById);

export default router;