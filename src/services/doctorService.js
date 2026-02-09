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
 * Plan Limit Helper - SaaS Quota Management
 */
const getPlanLimit = (plan) => {
  const p = String(plan || "").toUpperCase();
  if (p === "FREE") return 1;
  if (p === "PRO") return 3;
  if (p === "ENTERPRISE") return 10;
  if (p === "PROFESSIONAL" || p === "UNLIMITED") return Infinity;
  return 0;
};

/**
 * Data Sanitization & Normalization
 */
const normalizeDoctorData = (doctorData = {}) => {
  const data = { ...doctorData };

  if (data.email) data.email = String(data.email).trim().toLowerCase();
  if (data.name) data.name = String(data.name).trim();

  if (data.specialization) {
    data.specialization = String(data.specialization)
      .trim()
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

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
   * ✅ SaaS PROTOCOL: PLAN CHECK
   */
  async assertTenantCanAddDoctor(tenantId) {
    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      throw new AppError("Invalid tenant identity.", 400, "INVALID_TENANT");
    }

    const tenant = await Tenant.findById(tenantId).select("subscription.plan subscription.status name").lean();

    if (!tenant) throw new AppError("Clinic profile not found.", 404, "TENANT_NOT_FOUND");

    const status = String(tenant.subscription?.status || "").toUpperCase();
    if (status !== "ACTIVE") {
      throw new AppError("Subscription inactive. Protocol access denied.", 403, "SUBSCRIPTION_INACTIVE");
    }

    const plan = String(tenant.subscription?.plan || "").toUpperCase();
    const limit = getPlanLimit(plan);

    const currentCount = await Doctor.countDocuments({ tenantId, isDeleted: { $ne: true } });

    if (limit !== Infinity && currentCount >= limit) {
      throw new AppError(`Faculty limit reached for ${plan} tier.`, 403, "DOCTOR_LIMIT_REACHED");
    }

    return { plan, limit, tenantName: tenant.name };
  }

  /**
   * ✅ CREATE RECORD
   */
  async createDoctor(tenantId, doctorData, imageUrl = "", imagePublicId = "") {
    const tenantInfo = await this.assertTenantCanAddDoctor(tenantId);
    const data = normalizeDoctorData(doctorData);

    try {
      const doctor = await Doctor.create({
        ...data,
        tenantId,
        image: imageUrl,
        imagePublicId,
        isActive: true,
      });
      return { doctor, tenantName: tenantInfo.tenantName };
    } catch (err) {
      if (err?.code === 11000) throw new AppError("Email already exists in protocol.", 409, "DUPLICATE_EMAIL");
      throw err;
    }
  }

  /**
   * ✅ PUBLIC: Global Directory (Fixes Controller Crash)
   */
  async getAllDoctorsPublic() {
    return Doctor.find({ isDeleted: { $ne: true }, isActive: true })
      .select("name specialization consultationFee experience rating image availability")
      .populate("tenantId", "name slug") // Shows which clinic they belong to
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * ✅ PUBLIC: Specific Clinic Directory
   */
  async getDoctorsByClinicPublic(tenantId) {
    if (!mongoose.Types.ObjectId.isValid(tenantId)) throw new AppError("Invalid Clinic ID.", 400);
    
    return Doctor.find({ tenantId, isDeleted: { $ne: true }, isActive: true })
      .select("name specialization consultationFee experience rating image availability")
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * ✅ PUBLIC: Profile View
   */
  async getDoctorByIdPublic(doctorId) {
    if (!mongoose.Types.ObjectId.isValid(doctorId)) throw new AppError("Invalid ID.", 400);

    const doctor = await Doctor.findOne({ _id: doctorId, isDeleted: { $ne: true } })
      .populate("tenantId", "name slug about address")
      .lean();

    if (!doctor) throw new AppError("Specialist profile not found.", 404);
    return doctor;
  }

  /**
   * ✅ ADMIN: List for Dashboard
   */
  async getDoctors(tenantId) {
    return Doctor.find({ tenantId, isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * ✅ UPDATE RECORD
   */
  async updateDoctor(tenantId, doctorId, updateData) {
    const dataToUpdate = normalizeDoctorData(updateData);
    delete dataToUpdate.tenantId; // Immutable context

    const updated = await Doctor.findOneAndUpdate(
      { _id: doctorId, tenantId, isDeleted: { $ne: true } },
      { $set: dataToUpdate },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) throw new AppError("Target record not found.", 404);
    return updated;
  }

  /**
   * ✅ ARCHIVE (SOFT DELETE)
   */
  async softDeleteDoctor(tenantId, doctorId) {
    const updated = await Doctor.findOneAndUpdate(
      { _id: doctorId, tenantId },
      { $set: { isDeleted: true, isActive: false, deletedAt: new Date() } },
      { new: true }
    ).lean();

    if (!updated) throw new AppError("Archive target not found.", 404);
    return updated;
  }
}

export { AppError };
export default new DoctorService();