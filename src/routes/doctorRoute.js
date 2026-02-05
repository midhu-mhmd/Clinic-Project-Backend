import express from "express";
import {
  createDoctor,
  getAllDoctors,
  getDoctorById,       // Admin Version
  getDoctorByIdPublic, // Public Version (Critical for your Profile page)
  updateDoctor,
  deleteDoctor,
  getPublicDoctorDirectory,
  getDoctorsByClinic,
} from "../controllers/doctorController.js";

import upload from "../middlewares/uploadMiddleware.js";
import { protect, authorize } from "../middlewares/authMiddleware.js";
import { enforceDoctorLimit } from "../middlewares/enforceDoctorLimit.js";

const doctorRouter = express.Router();

/**
 * =========================
 * 1) PUBLIC ROUTES (NO TOKEN)
 * =========================
 */

// All doctors directory
doctorRouter.get("/directory", getPublicDoctorDirectory);

// Public list of doctors for a specific clinic
doctorRouter.get("/public/clinic/:clinicId", getDoctorsByClinic);

// ✅ FIX: Use a dedicated public controller
// This ensures 'tenantId' is populated and 'isDeleted' docs are hidden
doctorRouter.get("/public/:id", getDoctorByIdPublic);


/**
 * =========================
 * 2) PROTECTED ROUTES (TOKEN REQUIRED)
 * =========================
 */
doctorRouter.use(protect);
doctorRouter.use(authorize("CLINIC_ADMIN"));

/**
 * =========================
 * 3) TENANT ADMIN ROUTES
 * =========================
 */

// List all doctors for the logged-in tenant
doctorRouter.get("/", getAllDoctors);

// Get specific doctor (Admin view - sees more details)
doctorRouter.get("/:id", getDoctorById);

// Create doctor with plan enforcement and image upload
doctorRouter.post(
  "/",
  enforceDoctorLimit,
  upload.single("image"),
  createDoctor
);

// Update doctor details
doctorRouter.put("/:id", upload.single("image"), updateDoctor);

// Soft delete doctor
doctorRouter.delete("/:id", deleteDoctor);

export default doctorRouter;