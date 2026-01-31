import express from "express";

import {
  createDoctor,
  getAllDoctors,
  getDoctorById,
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
 * For patient-side booking / public directory.
 */

// All doctors directory (across tenants) - public listing
doctorRouter.get("/directory", getPublicDoctorDirectory);

// Booking: doctors by clinicId (public list)
// NOTE: This endpoint should return only active doctors.
// Ensure your controller uses doctorService.getDoctorsByClinicPublic(clinicId)
// or ensure service method filters active / not deleted.
doctorRouter.get("/public/clinic/:clinicId", getDoctorsByClinic);

// Public single doctor profile
doctorRouter.get("/public/:id", getDoctorById);

/**
 * =========================
 * 2) PROTECTED ROUTES (TOKEN REQUIRED)
 * =========================
 */
doctorRouter.use(protect);

/**
 * Only clinic admins should manage doctors under their tenant.
 * If you have STAFF role too, add it here.
 */
doctorRouter.use(authorize("CLINIC_ADMIN"));

/**
 * =========================
 * 3) TENANT ADMIN ROUTES
 * =========================
 */

// Admin: list doctors for logged-in tenant
doctorRouter.get("/", getAllDoctors);

// Admin: get single doctor
doctorRouter.get("/:id", getDoctorById);

// Admin: create doctor (PLAN LIMIT + PAYMENT STATUS enforced)
doctorRouter.post(
  "/",
  enforceDoctorLimit,
  upload.single("image"),
  createDoctor
);

// Admin: update doctor
doctorRouter.put("/:id", upload.single("image"), updateDoctor);

// Admin: soft delete doctor
doctorRouter.delete("/:id", deleteDoctor);

export default doctorRouter;
