import mongoose from "mongoose";
import Tenant from "../models/tenantModel.js";
import Doctor from "../models/doctorModel.js";

/**
 * Enforces plan-based doctor creation limits for clinic admins.
 * - Requires subscription status ACTIVE (payment completed)
 * - PRO -> 3 doctors
 * - ENTERPRISE -> 5 doctors
 * - PROFESSIONAL -> unlimited
 *
 * Attach this middleware ONLY on doctor creation route (POST /api/doctors)
 */
export const enforceDoctorLimit = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "Tenant context missing in token.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(String(tenantId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid tenant reference.",
      });
    }

    // Fetch tenant subscription details (lean for performance)
    const tenant = await Tenant.findById(tenantId)
      .select("subscription.plan subscription.status")
      .lean();

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found.",
      });
    }

    const plan = String(tenant.subscription?.plan || "").toUpperCase();
    const status = String(tenant.subscription?.status || "").toUpperCase();

    // ✅ Payment must be completed (only ACTIVE allowed)
    if (status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Subscription inactive. Complete payment to add doctors.",
      });
    }

    // ✅ Plan limits
    const limit =
      plan === "PRO" ? 3 :
      plan === "ENTERPRISE" ? 5 :
      plan === "PROFESSIONAL" ? Infinity :
      0;

    // Safety: unknown plan
    if (limit === 0) {
      return res.status(403).json({
        success: false,
        message: `Plan "${plan}" is not allowed for doctor creation.`,
      });
    }

    // PROFESSIONAL -> unlimited
    if (limit === Infinity) return next();

    // Count existing doctors under tenant (fast because tenantId is indexed)
    const currentCount = await Doctor.countDocuments({
      tenantId,
      isDeleted: { $ne: true },
    });

    if (currentCount >= limit) {
      return res.status(403).json({
        success: false,
        message: `Doctor limit reached for ${plan}. Max allowed: ${limit}.`,
      });
    }

    next();
  } catch (err) {
    console.error("enforceDoctorLimit error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while enforcing doctor plan limit.",
    });
  }
};
