import mongoose from "mongoose";
import Tenant from "../models/tenantModel.js";
import Doctor from "../models/doctorModel.js";
import Plan from "../models/planModel.js";

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

    // Fetch tenant subscription details
    const tenant = await Tenant.findById(tenantId)
      .select("subscription.plan subscription.status")
      .lean();

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found.",
      });
    }

    const planName = String(tenant.subscription?.plan || "").toUpperCase();
    const status = String(tenant.subscription?.status || "").toUpperCase();

    // Payment must be completed
    if (status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Subscription inactive. Complete payment to add doctors.",
      });
    }

    if (!planName) {
      return res.status(403).json({
        success: false,
        message: "Subscription plan missing.",
      });
    }

    // Load plan config from DB (single source of truth)
    const plan = await Plan.findOne({ name: planName, isActive: true })
      .select("limits.maxDoctors name")
      .lean();

    if (!plan) {
      return res.status(403).json({
        success: false,
        message: `Plan "${planName}" not found or inactive.`,
      });
    }

    const maxDoctors = plan?.limits?.maxDoctors;

    // -1 means unlimited (your convention)
    if (maxDoctors === -1) return next();

    // Defensive: invalid config
    if (typeof maxDoctors !== "number" || maxDoctors < 0) {
      return res.status(500).json({
        success: false,
        message: `Invalid maxDoctors config for plan "${planName}".`,
      });
    }

    const currentCount = await Doctor.countDocuments({
      tenantId,
      isDeleted: { $ne: true },
    });

    if (currentCount >= maxDoctors) {
      return res.status(403).json({
        success: false,
        message: `Doctor limit reached for ${planName}. Max allowed: ${maxDoctors}.`,
      });
    }

    return next();
  } catch (err) {
    console.error("enforceDoctorLimit error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while enforcing doctor plan limit.",
    });
  }
};
