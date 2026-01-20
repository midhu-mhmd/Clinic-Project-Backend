import express from "express";
import {
  createDoctor,
  getAllDoctors,
  updateDoctor,
  deleteDoctor,
} from "../controllers/doctorController.js";
import { protect } from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const doctorRouter = express.Router();

/**
 * 🔐 Protect all doctor routes
 * - Extracts req.user from JWT
 * - Provides req.user.tenantId for multi-tenancy
 */
doctorRouter.use(protect);

/**
 * @route   GET /api/doctors
 * @desc    Get all doctors for logged-in tenant
 */
doctorRouter.get("/", getAllDoctors);

/**
 * @route   POST /api/doctors
 * @desc    Create doctor (Cloudinary image optional)
 * @note    FormData key MUST be "image"
 */
doctorRouter.post(
  "/",
  upload.single("image"),
  createDoctor
);

/**
 * @route   PUT /api/doctors/:id
 * @desc    Update doctor details + replace image
 */
doctorRouter.put(
  "/:id",
  upload.single("image"),
  updateDoctor
);

/**
 * @route   DELETE /api/doctors/:id
 * @desc    Soft delete doctor (archive)
 */
doctorRouter.delete("/:id", deleteDoctor);

export default doctorRouter;
