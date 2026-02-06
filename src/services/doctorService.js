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
  
  // Sovereign Aesthetic: Ensure specialization is Title Cased
  if (data.specialization) {
    data.specialization = String(data.specialization)
      .trim()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
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
   * ✅ PLAN CHECK
   */
  async assertTenantCanAddDoctor(tenantId) {
    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      throw new AppError("Invalid tenant identity.", 400, "INVALID_TENANT");
    }

    const tenant = await Tenant.findById(tenantId)
      .select("subscription.plan subscription.status name")
      .lean();

    if (!tenant) {
      throw new AppError("Clinic profile not found.", 404, "TENANT_NOT_FOUND");
    }

    const status = String(tenant.subscription?.status || "").toUpperCase();
    if (status !== "ACTIVE") {
      throw new AppError(
        "Subscription inactive. Please renew your Sovereign Protocol access.",
        403,
        "SUBSCRIPTION_INACTIVE"
      );
    }

    const plan = String(tenant.subscription?.plan || "").toUpperCase();
    const limit = getPlanLimit(plan);

    if (limit === Infinity) return { plan, limit, tenantName: tenant.name };

    // Important: Only count non-deleted doctors towards the limit
    const currentCount = await Doctor.countDocuments({
      tenantId,
      isDeleted: { $ne: true },
    });

    if (currentCount >= limit) {
      throw new AppError(
        `Faculty limit reached for ${plan} tier. (Max: ${limit})`,
        403,
        "DOCTOR_LIMIT_REACHED"
      );
    }

    return { plan, limit, currentCount, tenantName: tenant.name };
  }

  /**
   * ✅ CREATE DOCTOR
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
        isActive: true, // Defaulting to true for new records
      });

      // NOTE: We return the doctor. 
      // The Controller should handle the email trigger via welcomeEmailTemplate
      return { doctor, tenantName: tenantInfo.tenantName };
      
    } catch (err) {
      if (err?.code === 11000) {
        throw new AppError(
          "This email is already registered within this clinical protocol.",
          409,
          "DUPLICATE_DOCTOR_EMAIL"
        );
      }
      throw err;
    }
  }

  /**
   * ✅ READ: Tenant Admin View (Dashboard)
   */
  async getDoctors(tenantId) {
    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      throw new AppError("Invalid tenantId.", 400, "INVALID_TENANT");
    }

    // Filter by isDeleted: { $ne: true } to keep the list clean
    return Doctor.find({ tenantId, isDeleted: { $ne: true } })
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
      throw new AppError("Required IDs missing.", 400, "INVALID_ID");
    }

    const doctor = await Doctor.findOne({ _id: doctorId, tenantId, isDeleted: { $ne: true } })
      .select(
        "name email specialization consultationFee education experience status availability image isActive createdAt updatedAt"
      )
      .lean();

    if (!doctor) throw new AppError("Doctor record not found.", 404, "DOCTOR_NOT_FOUND");
    return doctor;
  }

  /**
   * ✅ READ: Single Doctor Public (Profile Fix)
   */
  async getDoctorByIdPublic(doctorId) {
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      throw new AppError("Invalid identification.", 400, "INVALID_DOCTOR");
    }

    const doctor = await Doctor.findOne({ _id: doctorId, isDeleted: { $ne: true } })
      .select(
        "name specialization consultationFee education experience status availability image createdAt tenantId about rating"
      )
      .populate("tenantId", "name slug") 
      .lean();

    if (!doctor) throw new AppError("Specialist record is no longer active.", 404, "DOCTOR_NOT_FOUND");
    return doctor;
  }

  /**
   * ✅ UPDATE DOCTOR
   */
  async updateDoctor(tenantId, doctorId, updateData) {
    if (!mongoose.Types.ObjectId.isValid(tenantId) || !mongoose.Types.ObjectId.isValid(doctorId)) {
      throw new AppError("IDs required for update.", 400, "INVALID_ID");
    }

    const dataToUpdate = normalizeDoctorData(updateData);
    
    // Security: Prevent overriding critical SaaS fields
    delete dataToUpdate.tenantId;
    delete dataToUpdate._id;
    delete dataToUpdate.isDeleted;

    try {
      const updated = await Doctor.findOneAndUpdate(
        { _id: doctorId, tenantId, isDeleted: { $ne: true } },
        { $set: dataToUpdate },
        { new: true, runValidators: true }
      ).lean();

      if (!updated) throw new AppError("Update target not found.", 404, "DOCTOR_NOT_FOUND");
      return updated;
    } catch (err) {
      if (err?.code === 11000) {
        throw new AppError("Email collision detected.", 409, "DUPLICATE_DOCTOR_EMAIL");
      }
      throw err;
    }
  }

  /**
   * ✅ SOFT DELETE (Archiving)
   */
  async softDeleteDoctor(tenantId, doctorId) {
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

    if (!updated) throw new AppError("Archive target not found.", 404, "DOCTOR_NOT_FOUND");
    return updated;
  }
}

export { AppError };
export default new DoctorService();