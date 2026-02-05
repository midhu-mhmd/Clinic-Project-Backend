import Doctor from "../models/doctorModel.js";
import Tenant from "../models/tenantModel.js";
import mongoose from "mongoose";

/**
 * Custom Error Class for Service Layer
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = "SERVER_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Plan Limit Helper
 */
const getPlanLimit = (plan) => {
  const p = String(plan || "").toUpperCase();
  if (p === "PRO") return 3;
  if (p === "ENTERPRISE") return 5;
  if (p === "PROFESSIONAL") return Infinity;
  return 0;
};

/**
 * Data Sanitization & Normalization
 */
const normalizeDoctorData = (doctorData = {}) => {
  const data = { ...doctorData };

  if (data.email) data.email = String(data.email).trim().toLowerCase();
  if (data.name) data.name = String(data.name).trim();
  if (data.specialization) data.specialization = String(data.specialization).trim();

  if (data.experience !== undefined) {
    const v = Number(data.experience);
    data.experience = Number.isFinite(v) && v >= 0 ? v : 0;
  }

  if (data.consultationFee !== undefined) {
    const v = Number(data.consultationFee);
    data.consultationFee = Number.isFinite(v) && v >= 0 ? v : 0;
  }

  return data;
};

class DoctorService {
  /**
   * ✅ PLAN CHECK
   * Ensures tenant is active and hasn't exceeded their doctor quota.
   */
  async assertTenantCanAddDoctor(tenantId) {
    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      throw new AppError("Invalid tenantId.", 400, "INVALID_TENANT");
    }

    const tenant = await Tenant.findById(tenantId)
      .select("subscription.plan subscription.status")
      .lean();

    if (!tenant) {
      throw new AppError("Tenant not found.", 404, "TENANT_NOT_FOUND");
    }

    const status = String(tenant.subscription?.status || "").toUpperCase();
    if (status !== "ACTIVE") {
      throw new AppError(
        "Subscription inactive. Complete payment to add doctors.",
        403,
        "SUBSCRIPTION_INACTIVE"
      );
    }

    const plan = String(tenant.subscription?.plan || "").toUpperCase();
    const limit = getPlanLimit(plan);

    if (limit === Infinity) return { plan, limit };

    const currentCount = await Doctor.countDocuments({
      tenantId,
      isDeleted: { $ne: true },
    });

    if (currentCount >= limit) {
      throw new AppError(
        `Doctor limit reached for ${plan}. Max allowed: ${limit}.`,
        403,
        "DOCTOR_LIMIT_REACHED"
      );
    }

    return { plan, limit, currentCount };
  }

  /**
   * ✅ CREATE DOCTOR
   */
  async createDoctor(tenantId, doctorData, imageUrl = "", imagePublicId = "") {
    await this.assertTenantCanAddDoctor(tenantId);
    const data = normalizeDoctorData(doctorData);

    try {
      const doctor = await Doctor.create({
        ...data,
        tenantId,
        image: imageUrl,
        imagePublicId,
      });
      return doctor;
    } catch (err) {
      if (err?.code === 11000) {
        throw new AppError(
          "Doctor email already exists in this clinic.",
          409,
          "DUPLICATE_DOCTOR_EMAIL"
        );
      }
      throw err;
    }
  }

  /**
   * ✅ READ: Public Directory (Cross-tenant)
   */
  async getAllDoctorsPublic() {
    return Doctor.find({
      isActive: true,
      status: { $in: ["On Duty", "On Break"] },
    })
      .select(
        "name specialization education experience availability image rating status patientsCount tenantId consultationFee createdAt"
      )
      .populate("tenantId", "name slug image address subscription.plan")
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * ✅ READ: Clinic-Specific Public Doctors
   */
  async getDoctorsByClinicPublic(clinicId) {
    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
      throw new AppError("Invalid clinicId.", 400, "INVALID_CLINIC");
    }

    return Doctor.find({
      tenantId: clinicId,
      isActive: true,
      status: { $in: ["On Duty", "On Break"] },
    })
      .select(
        "name specialization education experience availability image status consultationFee createdAt"
      )
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * ✅ READ: Tenant Admin View
   */
  async getDoctors(tenantId) {
    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      throw new AppError("Invalid tenantId.", 400, "INVALID_TENANT");
    }

    return Doctor.find({ tenantId })
      .select(
        "name email specialization consultationFee education experience status availability image isActive createdAt updatedAt"
      )
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * ✅ READ: Single Doctor (Admin View)
   */
  async getDoctorById(tenantId, doctorId) {
    if (!mongoose.Types.ObjectId.isValid(tenantId) || !mongoose.Types.ObjectId.isValid(doctorId)) {
      throw new AppError("Invalid id.", 400, "INVALID_ID");
    }

    const doctor = await Doctor.findOne({ _id: doctorId, tenantId })
      .select(
        "name email specialization consultationFee education experience status availability image isActive createdAt updatedAt"
      )
      .lean();

    if (!doctor) throw new AppError("Doctor not found.", 404, "DOCTOR_NOT_FOUND");
    return doctor;
  }

  /**
   * ✅ READ: Single Doctor Public (The React Profile Fix)
   * Populates tenantId so the frontend can retrieve clinicId/clinicName.
   */
  async getDoctorByIdPublic(doctorId) {
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      throw new AppError("Invalid doctorId.", 400, "INVALID_DOCTOR");
    }

    const doctor = await Doctor.findOne({ _id: doctorId })
      .select(
        "name specialization consultationFee education experience status availability image createdAt tenantId about"
      )
      .populate("tenantId", "name slug") 
      .lean();

    if (!doctor) throw new AppError("Doctor not found.", 404, "DOCTOR_NOT_FOUND");
    return doctor;
  }

  /**
   * ✅ UPDATE DOCTOR
   */
  async updateDoctor(tenantId, doctorId, updateData) {
    if (!mongoose.Types.ObjectId.isValid(tenantId) || !mongoose.Types.ObjectId.isValid(doctorId)) {
      throw new AppError("Invalid id.", 400, "INVALID_ID");
    }

    const dataToUpdate = normalizeDoctorData(updateData);
    delete dataToUpdate.tenantId;
    delete dataToUpdate._id;
    delete dataToUpdate.isDeleted;

    try {
      const updated = await Doctor.findOneAndUpdate(
        { _id: doctorId, tenantId },
        { $set: dataToUpdate },
        { new: true, runValidators: true }
      ).lean();

      if (!updated) throw new AppError("Doctor not found.", 404, "DOCTOR_NOT_FOUND");
      return updated;
    } catch (err) {
      if (err?.code === 11000) {
        throw new AppError(
          "Doctor email already exists in this clinic.",
          409,
          "DUPLICATE_DOCTOR_EMAIL"
        );
      }
      throw err;
    }
  }

  /**
   * ✅ SOFT DELETE
   */
  async softDeleteDoctor(tenantId, doctorId) {
    if (!mongoose.Types.ObjectId.isValid(tenantId) || !mongoose.Types.ObjectId.isValid(doctorId)) {
      throw new AppError("Invalid id.", 400, "INVALID_ID");
    }

    const updated = await Doctor.findOneAndUpdate(
      { _id: doctorId, tenantId },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          isActive: false,
        },
      },
      { new: true }
    ).lean();

    if (!updated) throw new AppError("Doctor not found.", 404, "DOCTOR_NOT_FOUND");
    return updated;
  }
}

export { AppError };
export default new DoctorService();