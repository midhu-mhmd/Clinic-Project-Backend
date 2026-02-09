import express from "express";
import {
  createDoctor,
  getAllDoctors,
  getDoctorById,       // Admin Version
  getDoctorByIdPublic, // Public Version (Essential for Profile pages)
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

// Global Directory: GET /api/doctors/directory
doctorRouter.get("/directory", getPublicDoctorDirectory);

// Clinic-Specific List: GET /api/doctors/public/clinic/:clinicId
doctorRouter.get("/public/clinic/:clinicId", getDoctorsByClinic);

// Public Profile: GET /api/doctors/public/:id
// Populates tenant info and hides internal admin data
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

// Dashboard List: GET /api/doctors/
doctorRouter.get("/", getAllDoctors);

// Admin Profile View: GET /api/doctors/:id
doctorRouter.get("/:id", getDoctorById);

// Create Practitioner: POST /api/doctors/
doctorRouter.post(
  "/",
  enforceDoctorLimit, // Logic check for Plan Quotas
  upload.single("image"),
  createDoctor
);

// Update Practitioner: PUT /api/doctors/:id
doctorRouter.put("/:id", upload.single("image"), updateDoctor);

// Archive Practitioner: DELETE /api/doctors/:id
doctorRouter.delete("/:id", deleteDoctor);

export default doctorRouter;