import express from "express";
import { 
  createDoctor, 
  getAllDoctors, 
  updateDoctor, 
  deleteDoctor 
} from "../controllers/doctorController.js";
import { protect } from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const doctorRouter = express.Router();

/**
 * All routes are protected by the 'protect' middleware.
 * This ensures req.user.tenantId is extracted from the JWT 
 * before reaching the controller.
 */
doctorRouter.use(protect);

// @route   GET /api/doctors
// @desc    Fetch all practitioners for the authenticated tenant
doctorRouter.get("/", getAllDoctors);

// @route   POST /api/doctors
// @desc    Add a new practitioner with an optional profile image
// @note    'image' must match the key used in React's formData.append("image", file)
doctorRouter.post("/", upload.single("image"), createDoctor);

// @route   PUT /api/doctors/:id
// @desc    Update text and/or image for an existing practitioner
doctorRouter.put("/:id", upload.single("image"), updateDoctor);

// @route   DELETE /api/doctors/:id
// @desc    Soft delete (archive) a practitioner record
doctorRouter.delete("/:id", deleteDoctor);

export default doctorRouter;