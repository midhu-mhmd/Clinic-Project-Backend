import mongoose from "mongoose";
import doctorService, { AppError } from "../services/doctorService.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinaryUpload.js";
// ✅ Essential Email Imports
import { sendEmail } from "../utils/emailService.js";
import { doctorInvitationTemplate } from "../utils/emailTemplates.js";

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
 * ✅ CREATE DOCTOR + WELCOME EMAIL
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

    // 1. Image Processing
    if (req.file) {
      uploadedAsset = await uploadToCloudinary(req.file.buffer, "doctors");
      imageUrl = uploadedAsset.url;
      imagePublicId = uploadedAsset.publicId;
    }

    // 2. Database Creation
    // The service now returns { doctor, tenantName }
    const { doctor, tenantName } = await doctorService.createDoctor(
      tenantId,
      req.body,
      imageUrl,
      imagePublicId
    );

    // 3. ✅ DISPATCH WELCOME EMAIL
    // Wrapped in its own try/catch to ensure the API response finishes 
    // even if the email server has a hiccup.
    try {
      const loginLink = `${process.env.CLIENT_URL}/clinic-login`;
      const emailHtml = doctorInvitationTemplate(
        doctor.name,
        doctor.specialization,
        loginLink
      );

      await sendEmail({
        to: doctor.email,
        subject: `Faculty Appointment: ${tenantName}`,
        html: emailHtml,
      });
    } catch (emailErr) {
      console.error("Welcome Email Failed to Send:", emailErr.message);
      // We don't throw here; the doctor is already created.
    }

    return res.status(201).json({
      success: true,
      message: "Practitioner created and welcome protocol initiated.",
      data: doctor,
    });

  } catch (err) {
    // Cleanup Cloudinary if the DB step failed
    if (uploadedAsset?.publicId) {
      await deleteFromCloudinary(uploadedAsset.publicId).catch((e) => 
        console.error("Cleanup Error:", e.message)
      );
    }
    return sendError(res, err, "Failed to create practitioner.");
  }
};

/**
 * FETCH BY CLINIC ID (PUBLIC)
 */
export const getDoctorsByClinic = async (req, res) => {
  try {
    const { clinicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(400).json({ success: false, message: "Invalid Facility ID." });
    }

    const doctors = await doctorService.getDoctorsByClinicPublic(clinicId);
    return res.status(200).json({ success: true, count: doctors.length, data: doctors });
  } catch (err) {
    return sendError(res, err, "Failed to fetch specialists.");
  }
};

/**
 * PUBLIC DIRECTORY (ALL CLINICS)
 */
export const getPublicDoctorDirectory = async (req, res) => {
  try {
    const doctors = await doctorService.getAllDoctorsPublic();
    return res.status(200).json({ success: true, count: doctors.length, data: doctors });
  } catch (err) {
    return sendError(res, err, "Failed to fetch directory.");
  }
};

/**
 * GET SINGLE DOCTOR (ADMIN OR PUBLIC)
 */
export const getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID format." });
    }

    const doctor = tenantId
      ? await doctorService.getDoctorById(tenantId, id)
      : await doctorService.getDoctorByIdPublic(id);

    return res.status(200).json({ success: true, data: doctor });
  } catch (err) {
    return sendError(res, err, "Failed to retrieve profile.");
  }
};

/**
 * GET ALL (TENANT ADMIN VIEW)
 */
export const getAllDoctors = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new AppError("Unauthorized.", 401);

    const doctors = await doctorService.getDoctors(tenantId);
    return res.status(200).json({ success: true, count: doctors.length, data: doctors });
  } catch (err) {
    return sendError(res, err, "Failed to fetch practitioners.");
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
      if (current?.imagePublicId) {
        await deleteFromCloudinary(current.imagePublicId).catch(() => {});
      }
      newUpload = await uploadToCloudinary(req.file.buffer, "doctors");
      updateData.image = newUpload.url;
      updateData.imagePublicId = newUpload.publicId;
    }

    const updatedDoctor = await doctorService.updateDoctor(tenantId, id, updateData);
    return res.status(200).json({ success: true, message: "Practitioner updated.", data: updatedDoctor });
  } catch (err) {
    if (newUpload?.publicId) await deleteFromCloudinary(newUpload.publicId).catch(() => {});
    return sendError(res, err, "Failed to update practitioner.");
  }
};

/**
 * DELETE DOCTOR (SOFT DELETE)
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

    return res.status(200).json({ success: true, message: "Practitioner archived." });
  } catch (err) {
    return sendError(res, err, "Failed to archive practitioner.");
  }
};
/**
 * GET SINGLE DOCTOR (EXPLICIT PUBLIC)
 * Dedicated endpoint for patient-facing profile pages.
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

    // Directly calls the public service method
    const doctor = await doctorService.getDoctorByIdPublic(id);

    return res.status(200).json({
      success: true,
      data: doctor,
    });
  } catch (err) {
    return sendError(res, err, "Failed to retrieve public practitioner profile.");
  }
};