import mongoose from "mongoose";
import doctorService, { AppError } from "../services/doctorService.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinaryUpload.js";
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
    if (!tenantId) throw new AppError("Unauthorized: tenant context missing.", 401);

    let imageUrl = "";
    let imagePublicId = "";

    if (req.file) {
      uploadedAsset = await uploadToCloudinary(req.file.buffer, "doctors");
      imageUrl = uploadedAsset.url;
      imagePublicId = uploadedAsset.publicId;
    }

    const { doctor, tenantName } = await doctorService.createDoctor(
      tenantId,
      req.body,
      imageUrl,
      imagePublicId
    );

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
      console.error("Welcome Email Failed:", emailErr.message);
    }

    return res.status(201).json({
      success: true,
      message: "Practitioner created and welcome protocol initiated.",
      data: doctor,
    });

  } catch (err) {
    if (uploadedAsset?.publicId) {
      await deleteFromCloudinary(uploadedAsset.publicId).catch(() => { });
    }
    return sendError(res, err, "Failed to create practitioner.");
  }
};

/**
 * ✅ PUBLIC DIRECTORY (Global Search + Pagination)
 */
export const getPublicDoctorDirectory = async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder, ...filters } = req.query;

    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === "asc" ? 1 : -1;
    } else {
      sort.createdAt = -1;
    }

    const result = await doctorService.getAllDoctorsPublic({
      page,
      limit,
      search,
      filters,
      sort
    });

    return res.status(200).json({
      success: true,
      count: result.data.length,
      meta: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages
      },
      data: result.data
    });
  } catch (err) {
    return sendError(res, err, "Failed to fetch directory.");
  }
};

/**
 * ✅ ADMIN: BULK STATUS UPDATE
 */
export const bulkUpdateStatus = async (req, res) => {
  try {
    const { doctorIds, isActive, verificationStatus } = req.body;
    await doctorService.bulkUpdateStatus(doctorIds, { isActive, verificationStatus });

    return res.status(200).json({
      success: true,
      message: `Updated status for ${doctorIds.length} practitioners.`
    });
  } catch (err) {
    return sendError(res, err, "Bulk update failed.");
  }
};

/**
 * ✅ ADMIN: EXPORT CSV
 */
export const exportDoctorsCSV = async (req, res) => {
  try {
    const { search, ...filters } = req.query;
    const doctors = await doctorService.exportDoctorsData(filters);

    let csv = "Name,Specialization,Email,Phone,Reg No,Consult Fee,Status,Verification,Clinic,Created At\n";
    doctors.forEach(d => {
      csv += `"${d.name}","${d.specialization}","${d.email}","${d.phoneNumber || ''}","${d.regNo || ''}","${d.consultationFee}","${d.isActive ? 'Active' : 'Inactive'}","${d.verificationStatus}","${d.tenantId?.name || ''}","${d.createdAt}"\n`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=doctors_export.csv");
    return res.status(200).send(csv);
  } catch (err) {
    return sendError(res, err, "Export failed.");
  }
};

/**
 * ✅ PUBLIC: FETCH BY CLINIC ID
 */
export const getDoctorsByClinic = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const doctors = await doctorService.getDoctorsByClinicPublic(clinicId);
    return res.status(200).json({ success: true, count: doctors.length, data: doctors });
  } catch (err) {
    return sendError(res, err, "Failed to fetch facility specialists.");
  }
};

/**
 * ✅ PUBLIC: SINGLE DOCTOR PROFILE
 */
export const getDoctorByIdPublic = async (req, res) => {
  try {
    const { id } = req.params;
    const doctor = await doctorService.getDoctorByIdPublic(id);
    return res.status(200).json({ success: true, data: doctor });
  } catch (err) {
    return sendError(res, err, "Failed to retrieve public profile.");
  }
};

/**
 * ✅ ADMIN: GET SINGLE DOCTOR (The missing piece that caused the crash)
 */
export const getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID format." });
    }

    const doctor = await doctorService.getDoctorById(tenantId, id);
    return res.status(200).json({ success: true, data: doctor });
  } catch (err) {
    return sendError(res, err, "Failed to retrieve practitioner data.");
  }
};

/**
 * ✅ ADMIN: GET ALL (Dashboard View)
 */
export const getAllDoctors = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new AppError("Unauthorized access.", 401);

    const doctors = await doctorService.getDoctors(tenantId);
    return res.status(200).json({ success: true, count: doctors.length, data: doctors });
  } catch (err) {
    return sendError(res, err, "Failed to fetch practitioners.");
  }
};

/**
 * ✅ ADMIN: UPDATE DOCTOR
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
        await deleteFromCloudinary(current.imagePublicId).catch(() => { });
      }
      newUpload = await uploadToCloudinary(req.file.buffer, "doctors");
      updateData.image = newUpload.url;
      updateData.imagePublicId = newUpload.publicId;
    }

    const updated = await doctorService.updateDoctor(tenantId, id, updateData);
    return res.status(200).json({ success: true, message: "Practitioner updated.", data: updated });
  } catch (err) {
    if (newUpload?.publicId) await deleteFromCloudinary(newUpload.publicId).catch(() => { });
    return sendError(res, err, "Failed to update practitioner.");
  }
};

/**
 * ✅ ADMIN: ARCHIVE DOCTOR (SOFT DELETE)
 */
export const deleteDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new AppError("Unauthorized.", 401);

    const doctor = await doctorService.getDoctorById(tenantId, id);
    if (doctor?.imagePublicId) {
      await deleteFromCloudinary(doctor.imagePublicId).catch(() => { });
    }

    await doctorService.softDeleteDoctor(tenantId, id);
    return res.status(200).json({ success: true, message: "Practitioner archived." });
  } catch (err) {
    return sendError(res, err, "Failed to archive practitioner.");
  }
};