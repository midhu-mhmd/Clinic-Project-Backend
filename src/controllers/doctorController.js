import mongoose from "mongoose";
import doctorService, { AppError } from "../services/doctorService.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

/**
 * Centralized error responder
 */
const sendError = (res, err, fallbackMessage = "Server error.") => {
  if (err instanceof AppError) {
    return res.status(err.statusCode || 500).json({
      success: false,
      code: err.code || "ERROR",
      message: err.message || fallbackMessage,
    });
  }

  if (err?.code === 11000) {
    return res.status(409).json({
      success: false,
      code: "DUPLICATE_KEY",
      message: "A practitioner with this email already exists in this facility.",
    });
  }

  console.error("Controller Error:", err);
  return res.status(500).json({
    success: false,
    message: err?.message || fallbackMessage,
  });
};

/**
 * FETCH BY CLINIC ID (PUBLIC)
 * Used by patients to see doctors available at a specific clinic.
 */
export const getDoctorsByClinic = async (req, res) => {
  try {
    const { clinicId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Facility ID format.",
      });
    }

    // ✅ FIXED: Call the PUBLIC method to filter for active/on-duty doctors only
    const doctors = await doctorService.getDoctorsByClinicPublic(clinicId);

    return res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (err) {
    return sendError(res, err, "Failed to fetch specialists for this facility.");
  }
};

/**
 * PUBLIC DIRECTORY
 * Fetches all active doctors across all clinics for the search page.
 */
export const getPublicDoctorDirectory = async (req, res) => {
  try {
    const doctors = await doctorService.getAllDoctorsPublic();

    return res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (err) {
    return sendError(res, err, "Failed to fetch directory.");
  }
};

/**
 * GET SINGLE DOCTOR
 * Smart routing: Provides full data for admins, sanitized data for patients.
 */
export const getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId; // Presence of tenantId indicates Admin context

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Practitioner ID format.",
      });
    }

    const doctor = tenantId
      ? await doctorService.getDoctorById(tenantId, id)
      : await doctorService.getDoctorByIdPublic(id);

    return res.status(200).json({
      success: true,
      data: doctor,
    });
  } catch (err) {
    return sendError(res, err, "Failed to retrieve practitioner profile.");
  }
};

/**
 * GET ALL (PRIVATE ADMIN)
 * Admin view for the logged-in tenant only.
 */
export const getAllDoctors = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: tenant context missing.",
      });
    }

    const doctors = await doctorService.getDoctors(tenantId);

    return res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (err) {
    return sendError(res, err, "Failed to fetch practitioners.");
  }
};

/**
 * CREATE DOCTOR
 * Handles Cloudinary upload with automatic rollback on DB failure.
 */
export const createDoctor = async (req, res) => {
  let uploadedAsset = null;

  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: tenant context missing.",
      });
    }

    let imageUrl = "";
    let imagePublicId = "";

    if (req.file) {
      uploadedAsset = await uploadToCloudinary(req.file.buffer, "doctors");
      imageUrl = uploadedAsset.url;
      imagePublicId = uploadedAsset.publicId;
    }

    const doctor = await doctorService.createDoctor(
      tenantId,
      req.body,
      imageUrl,
      imagePublicId
    );

    return res.status(201).json({
      success: true,
      message: "Practitioner created successfully.",
      data: doctor,
    });
  } catch (err) {
    // 🗑️ Cleanup Cloudinary if DB save failed
    if (uploadedAsset?.publicId) {
      await deleteFromCloudinary(uploadedAsset.publicId).catch((e) => 
        console.error("Cloudinary Cleanup Error:", e.message)
      );
    }
    return sendError(res, err, "Failed to create practitioner.");
  }
};

/**
 * UPDATE DOCTOR
 */
export const updateDoctor = async (req, res) => {
  let newUpload = null;

  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) throw new AppError("Unauthorized.", 401);

    let updateData = { ...req.body };

    if (req.file) {
      const current = await doctorService.getDoctorById(tenantId, id);
      
      // Delete old image if it exists
      if (current?.imagePublicId) {
        await deleteFromCloudinary(current.imagePublicId).catch(() => {});
      }

      newUpload = await uploadToCloudinary(req.file.buffer, "doctors");
      updateData.image = newUpload.url;
      updateData.imagePublicId = newUpload.publicId;
    }

    const updatedDoctor = await doctorService.updateDoctor(tenantId, id, updateData);

    return res.status(200).json({
      success: true,
      message: "Practitioner updated successfully.",
      data: updatedDoctor,
    });
  } catch (err) {
    if (newUpload?.publicId) {
      await deleteFromCloudinary(newUpload.publicId).catch(() => {});
    }
    return sendError(res, err, "Failed to update practitioner.");
  }
};

/**
 * DELETE DOCTOR
 * Soft delete + Cloudinary image removal.
 */
export const deleteDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) throw new AppError("Unauthorized.", 401);

    const doctor = await doctorService.getDoctorById(tenantId, id);

    if (doctor?.imagePublicId) {
      await deleteFromCloudinary(doctor.imagePublicId).catch(() => {});
    }

    await doctorService.softDeleteDoctor(tenantId, id);

    return res.status(200).json({
      success: true,
      message: "Practitioner archived successfully.",
    });
  } catch (err) {
    return sendError(res, err, "Failed to archive practitioner.");
  }
};
/**
 * GET SINGLE DOCTOR (PUBLIC)
 * Expressly for the patient-facing profile page.
 */
export const getDoctorByIdPublic = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Practitioner ID format.",
      });
    }

    // Calls the service method that populates tenantId
    const doctor = await doctorService.getDoctorByIdPublic(id);

    return res.status(200).json({
      success: true,
      data: doctor,
    });
  } catch (err) {
    return sendError(res, err, "Failed to retrieve practitioner profile.");
  }
};