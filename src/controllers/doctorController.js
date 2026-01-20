import mongoose from "mongoose";
import doctorService from "../services/doctorService.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

/**
 * CREATE doctor
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

    const doctor = await doctorService.createDoctor(
      tenantId,
      req.body,
      imageUrl,
      imagePublicId
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
 * GET all doctors (tenant isolated)
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
 * UPDATE doctor
 */
export const updateDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Practitioner ID" });
    }

    let updateData = { ...req.body };

    // 1. If a new file is present, handle image replacement
    if (req.file) {
      // Fetch specifically this doctor to check for old image
      const doctor = await doctorService.getDoctorById(tenantId, id);
      
      if (!doctor) {
        return res.status(404).json({ success: false, message: "Practitioner not found" });
      }

      // Delete old image from Cloudinary if it exists
      if (doctor.imagePublicId) {
        await deleteFromCloudinary(doctor.imagePublicId);
      }

      // Upload new image
      const uploaded = await uploadToCloudinary(req.file.buffer, "doctors");
      updateData.image = uploaded.url;
      updateData.imagePublicId = uploaded.publicId;
    }

    // 2. Update the record
    const updatedDoctor = await doctorService.updateDoctor(tenantId, id, updateData);

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
 * SOFT DELETE doctor
 */
export const deleteDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    // Fetch specifically this doctor
    const doctor = await doctorService.getDoctorById(tenantId, id);

    if (!doctor) {
      return res.status(404).json({ success: false, message: "Practitioner not found" });
    }

    // Cleanup Cloudinary image
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