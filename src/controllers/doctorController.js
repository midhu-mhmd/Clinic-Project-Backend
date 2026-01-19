import doctorService from "../services/doctorService.js";
import mongoose from "mongoose";

/**
 * Controller for Medical Faculty Management
 * Handles Multi-tenancy isolation via req.user.tenantId
 */

// POST: Create a new practitioner
export const createDoctor = async (req, res) => {
  try {
    const tenantId = req.user.tenantId; 
    // filePath is the relative path where Multer saved the image
    const filePath = req.file ? req.file.path : null;

    const doctor = await doctorService.createDoctor(tenantId, req.body, filePath);

    res.status(201).json({
      success: true,
      message: "Practitioner created successfully",
      data: doctor
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to create practitioner record." 
    });
  }
};

// GET: Fetch all active practitioners for the tenant
export const getAllDoctors = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const doctors = await doctorService.getDoctors(tenantId);

    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to fetch practitioners." 
    });
  }
};

// PUT: Update an existing practitioner record
export const updateDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    
    // Validate MongoDB ID format to prevent casting errors
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Practitioner ID format" });
    }

    // req.file is populated if the user uploaded a new image in the React form
    const filePath = req.file ? req.file.path : null;

    const updatedDoctor = await doctorService.updateDoctor(
      tenantId, 
      id, 
      req.body, 
      filePath
    );

    if (!updatedDoctor) {
      return res.status(404).json({ 
        success: false, 
        message: "Practitioner record not found or access denied." 
      });
    }

    res.status(200).json({
      success: true,
      message: "Record updated successfully",
      data: updatedDoctor
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message || "Error updating practitioner record." 
    });
  }
};

// DELETE: Soft delete a practitioner record
export const deleteDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Practitioner ID format" });
    }

    const deletedDoctor = await doctorService.softDeleteDoctor(tenantId, id);

    if (!deletedDoctor) {
      return res.status(404).json({ 
        success: false, 
        message: "Practitioner record not found or already archived." 
      });
    }

    res.status(200).json({
      success: true,
      message: "Practitioner record archived successfully"
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message || "Error archiving practitioner record." 
    });
  }
};