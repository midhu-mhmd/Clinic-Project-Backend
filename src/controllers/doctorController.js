import mongoose from "mongoose";
import doctorService from "../services/doctorService.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

/**
 * @desc    GET all doctors across ALL clinics (Global Directory)
 * @access  Public (Patient Side)
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
 * @desc    GET single doctor by ID (Public or Tenant Isolated)
 * @access  Public/Private
 */
export const getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is logged in as Admin (tenant isolation) or Patient (Public)
    const tenantId = req.user?.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid Practitioner ID format" 
      });
    }

    let doctor;
    if (tenantId) {
      // Admin View: Must belong to their clinic
      doctor = await doctorService.getDoctorById(tenantId, id);
    } else {
      // Patient/Public View: Fetch by ID regardless of clinic
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
 * @desc    GET all doctors for a SPECIFIC tenant
 * @access  Private (Admin Side)
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
 * @desc    CREATE doctor
 * @access  Private (Admin Only)
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
 * @desc    UPDATE doctor
 * @access  Private (Admin Only)
 */
export const updateDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Practitioner ID" });
    }

    let updateData = { ...req.body };

    if (req.file) {
      const doctor = await doctorService.getDoctorById(tenantId, id);
      
      if (!doctor) {
        return res.status(404).json({ success: false, message: "Practitioner not found" });
      }

      if (doctor.imagePublicId) {
        await deleteFromCloudinary(doctor.imagePublicId);
      }

      const uploaded = await uploadToCloudinary(req.file.buffer, "doctors");
      updateData.image = uploaded.url;
      updateData.imagePublicId = uploaded.publicId;
    }

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
 * @desc    SOFT DELETE doctor
 * @access  Private (Admin Only)
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
      return res.status(404).json({ success: false, message: "Practitioner not found" });
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