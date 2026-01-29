import mongoose from "mongoose";
import doctorService from "../services/doctorService.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

/**
 * FETCH BY CLINIC ID
 * Used by the appointment booking flow to filter faculty by facility.
 */
export const getDoctorsByClinic = async (req, res) => {
  try {
    const { clinicId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Facility ID format",
      });
    }

    // This calls the service method that handles the 'tenantId' query
    const doctors = await doctorService.getDoctorsByClinic(clinicId);

    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch specialists for this facility",
    });
  }
};

/**
 * PUBLIC DIRECTORY
 * Fetches all active doctors across all clinics.
 */
export const getPublicDoctorDirectory = async (req, res) => {
  try {
    const doctors = await doctorService.getAllDoctorsPublic();

    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch directory",
    });
  }
};

/**
 * GET SINGLE DOCTOR
 * Handles both public view and authenticated tenant view.
 */
export const getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Practitioner ID format",
      });
    }

    let doctor;
    if (tenantId) {
      doctor = await doctorService.getDoctorById(tenantId, id);
    } else {
      doctor = await doctorService.getDoctorByIdPublic(id);
    }

    if (!doctor || doctor.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Practitioner profile not found or has been archived.",
      });
    }

    res.status(200).json({
      success: true,
      data: doctor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve practitioner profile",
    });
  }
};

/**
 * GET ALL (PRIVATE)
 * Admin view for a specific tenant.
 */
export const getAllDoctors = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const doctors = await doctorService.getDoctors(tenantId);

    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch practitioners",
    });
  }
};

/**
 * CREATE DOCTOR
 * Includes image upload to Cloudinary and uses the updated service.
 */
export const createDoctor = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    let imageUrl = "";
    let imagePublicId = "";

    if (req.file) {
      const uploaded = await uploadToCloudinary(req.file.buffer, "doctors");
      imageUrl = uploaded.url;
      imagePublicId = uploaded.publicId;
    }

    // doctorService now handles the numeric conversion for consultationFee
    const doctor = await doctorService.createDoctor(
      tenantId,
      req.body,
      imageUrl,
      imagePublicId,
    );

    res.status(201).json({
      success: true,
      message: "Practitioner created successfully",
      data: doctor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create practitioner",
    });
  }
};

/**
 * UPDATE DOCTOR
 * Handles data modification and image replacement.
 */
export const updateDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Practitioner ID" });
    }

    let updateData = { ...req.body };

    if (req.file) {
      const doctor = await doctorService.getDoctorById(tenantId, id);

      if (!doctor) {
        return res
          .status(404)
          .json({ success: false, message: "Practitioner not found" });
      }

      if (doctor.imagePublicId) {
        await deleteFromCloudinary(doctor.imagePublicId);
      }

      const uploaded = await uploadToCloudinary(req.file.buffer, "doctors");
      updateData.image = uploaded.url;
      updateData.imagePublicId = uploaded.publicId;
    }

    const updatedDoctor = await doctorService.updateDoctor(
      tenantId,
      id,
      updateData,
    );

    if (!updatedDoctor) {
      return res.status(404).json({
        success: false,
        message: "Practitioner not found or access denied",
      });
    }

    res.status(200).json({
      success: true,
      message: "Practitioner updated successfully",
      data: updatedDoctor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update practitioner",
    });
  }
};

/**
 * DELETE DOCTOR
 * Performs a soft delete and removes assets from Cloudinary.
 */
export const deleteDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const doctor = await doctorService.getDoctorById(tenantId, id);

    if (!doctor) {
      return res
        .status(404)
        .json({ success: false, message: "Practitioner not found" });
    }

    if (doctor.imagePublicId) {
      await deleteFromCloudinary(doctor.imagePublicId);
    }

    await doctorService.softDeleteDoctor(tenantId, id);

    res.status(200).json({
      success: true,
      message: "Practitioner archived successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to archive practitioner",
    });
  }
};