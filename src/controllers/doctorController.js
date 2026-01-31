import mongoose from "mongoose";
import doctorService, { AppError } from "../services/doctorService.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

/**
 * Centralized error responder
 * - supports AppError (service errors)
 * - supports Mongo duplicate key
 */
const sendError = (res, err, fallbackMessage = "Server error.") => {
  // AppError from service layer
  if (err instanceof AppError) {
    return res.status(err.statusCode || 500).json({
      success: false,
      code: err.code || "ERROR",
      message: err.message || fallbackMessage,
    });
  }

  // Mongoose duplicate key (just in case)
  if (err?.code === 11000) {
    return res.status(409).json({
      success: false,
      code: "DUPLICATE_KEY",
      message: "Duplicate record detected.",
    });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    message: err?.message || fallbackMessage,
  });
};

/**
 * FETCH BY CLINIC ID (PRIVATE LIST by clinicId)
 * Used by booking flow etc.
 * Your service earlier had getDoctorsByClinic(clinicId) (tenant-specific list).
 * If you want public-only, use getDoctorsByClinicPublic().
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

    // If this is meant to be PUBLIC booking list, call public method:
    // const doctors = await doctorService.getDoctorsByClinicPublic(clinicId);

    // If this is tenant/admin view, call tenant-admin list:
    const doctors = await doctorService.getDoctors(clinicId);

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
 * Fetches all active doctors across all clinics.
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
 * Supports:
 * - tenant restricted view if req.user.tenantId exists
 * - else public view
 *
 * NOTE: ideally keep separate endpoints:
 *  - /api/doctors/public/:id
 *  - /api/doctors/:id (protected)
 * But this works too.
 */
export const getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;

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
 * GET ALL (PRIVATE)
 * Admin view for tenantId from token
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
 * ✅ plan limit enforced in service: createDoctor() calls assertTenantCanAddDoctor()
 * ✅ cloudinary upload happens first, but we cleanup if DB fails
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
    // Cleanup cloudinary if DB failed
    if (uploadedAsset?.publicId) {
      try {
        await deleteFromCloudinary(uploadedAsset.publicId);
      } catch (cleanupErr) {
        console.error("Cloudinary cleanup failed:", cleanupErr?.message);
      }
    }
    return sendError(res, err, "Failed to create practitioner.");
  }
};

/**
 * UPDATE DOCTOR
 * ✅ if file uploaded: delete old cloudinary asset, upload new
 * ✅ minimal DB read: we only need imagePublicId
 */
export const updateDoctor = async (req, res) => {
  let newUpload = null;

  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: tenant context missing.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Practitioner ID.",
      });
    }

    let updateData = { ...req.body };

    // Image replacement flow
    if (req.file) {
      // fetch minimal current doctor
      const current = await doctorService.getDoctorById(tenantId, id);

      // delete previous cloudinary asset if exists
      if (current?.imagePublicId) {
        await deleteFromCloudinary(current.imagePublicId);
      }

      // upload new
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
    // cleanup new upload if update fails after upload
    if (newUpload?.publicId) {
      try {
        await deleteFromCloudinary(newUpload.publicId);
      } catch (cleanupErr) {
        console.error("Cloudinary rollback failed:", cleanupErr?.message);
      }
    }
    return sendError(res, err, "Failed to update practitioner.");
  }
};

/**
 * DELETE DOCTOR
 * Soft delete + remove cloudinary asset
 */
export const deleteDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: tenant context missing.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Practitioner ID.",
      });
    }

    const doctor = await doctorService.getDoctorById(tenantId, id);

    if (doctor?.imagePublicId) {
      await deleteFromCloudinary(doctor.imagePublicId);
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
