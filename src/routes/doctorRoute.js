import express from "express";
import {
  createDoctor,
  getAllDoctors,
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  getPublicDoctorDirectory, // Import the new global directory controller
} from "../controllers/doctorController.js";
import { protect } from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const doctorRouter = express.Router();

/**
 * --- PUBLIC ROUTES ---
 * Accessible by anyone (Patients)
 * These must be defined BEFORE doctorRouter.use(protect)
 */

// GET all doctors from all clinics
doctorRouter.get("/directory", getPublicDoctorDirectory);

// GET single doctor details (Public version)
doctorRouter.get("/public/:id", getDoctorById);


/**
 * --- PROTECTED ROUTES ---
 * Requires a valid token (Clinic Admins)
 */
doctorRouter.use(protect);

/**
 * @route   GET /api/doctors
 * @desc    Get doctors belonging ONLY to the logged-in admin's clinic
 */
doctorRouter.get("/", getAllDoctors);

/**
 * @route   GET /api/doctors/:id
 */
doctorRouter.get("/:id", getDoctorById);

/**
 * @route   POST /api/doctors
 */
doctorRouter.post(
  "/",
  upload.single("image"),
  createDoctor
);

/**
 * @route   PUT /api/doctors/:id
 */
doctorRouter.put(
  "/:id",
  upload.single("image"),
  updateDoctor
);

/**
 * @route   DELETE /api/doctors/:id
 */
doctorRouter.delete("/:id", deleteDoctor);

export default doctorRouter;