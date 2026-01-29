import express from "express";
import {
  createDoctor,
  getAllDoctors,
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  getPublicDoctorDirectory,
  getDoctorsByClinic, // Import verified
} from "../controllers/doctorController.js";
import { protect } from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const doctorRouter = express.Router();

// --- 1. PUBLIC ROUTES ---
// Routes accessible without a token
doctorRouter.get("/directory", getPublicDoctorDirectory);
doctorRouter.get("/public/:id", getDoctorById);

// --- 2. AUTHENTICATION MIDDLEWARE ---
// All routes below this line require a valid Bearer token
doctorRouter.use(protect);

// --- 3. PROTECTED ROUTES ---

// Get all doctors (Admin/Internal view)
doctorRouter.get("/", getAllDoctors);

/**
 * FETCH DOCTORS BY CLINIC
 * Matches: GET /api/doctors/clinic/:clinicId
 * Note: Placed above /:id to prevent "clinic" being treated as a doctor ID
 */
doctorRouter.get("/clinic/:clinicId", getDoctorsByClinic);

// Get specific doctor by ID
doctorRouter.get("/:id", getDoctorById);

// Management Routes
doctorRouter.post("/", upload.single("image"), createDoctor);
doctorRouter.put("/:id", upload.single("image"), updateDoctor);
doctorRouter.delete("/:id", deleteDoctor);

export default doctorRouter;