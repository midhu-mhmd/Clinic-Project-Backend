import mongoose from "mongoose";
import Tenant from "../models/tenantModel.js";
import Plan from "../models/planModel.js";

/**
 * Generic plan-feature gate middleware factory.
 *
 * Usage:
 *   enforcePlanFeature("allowAPI")          — boolean feature check
 *   enforcePlanFeature("customBranding")    — boolean feature check
 *   enforcePlanFeature("maxPatients", countFn) — numeric limit check
 *
 * @param {string} limitKey   - key inside Plan.limits  (e.g. "maxPatients", "allowAPI")
 * @param {Function} [countFn] - async (tenantId) => number  — current usage count
 *                                Required only for numeric limits.
 */
export const enforcePlanFeature = (limitKey, countFn) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.user?.tenantId || req.body?.tenantId || req.query?.tenantId;
      if (!tenantId || !mongoose.Types.ObjectId.isValid(String(tenantId))) {
        return res.status(400).json({ success: false, message: "Tenant context missing." });
      }

      const tenant = await Tenant.findById(tenantId)
        .select("subscription.plan subscription.status")
        .lean();

      if (!tenant) {
        return res.status(404).json({ success: false, message: "Tenant not found." });
      }

      const status = String(tenant.subscription?.status || "").toUpperCase();
      if (status !== "ACTIVE") {
        return res.status(403).json({
          success: false,
          message: "Subscription inactive. Please activate your plan.",
        });
      }

      const planName = String(tenant.subscription?.plan || "").toUpperCase();
      const plan = await Plan.findOne({ name: planName, isActive: true })
        .select("limits name")
        .lean();

      if (!plan) {
        return res.status(403).json({
          success: false,
          message: `Plan "${planName}" not found or inactive.`,
        });
      }

      const limitValue = plan.limits?.[limitKey];

      // Boolean feature (e.g. allowAPI, customBranding)
      if (typeof limitValue === "boolean") {
        if (!limitValue) {
          return res.status(403).json({
            success: false,
            message: `Feature "${limitKey}" is not available on the ${planName} plan. Please upgrade.`,
          });
        }
        return next();
      }

      // Numeric limit (e.g. maxPatients, maxStorageGB)
      if (typeof limitValue === "number") {
        if (limitValue === -1) return next(); // unlimited

        if (!countFn) {
          return res.status(500).json({
            success: false,
            message: `Server misconfiguration: no counter for "${limitKey}".`,
          });
        }

        const currentCount = await countFn(tenantId);
        if (currentCount >= limitValue) {
          return res.status(403).json({
            success: false,
            message: `${limitKey} limit reached for ${planName} plan. Max allowed: ${limitValue}. Please upgrade.`,
          });
        }
        return next();
      }

      // Unknown limit type — allow through
      return next();
    } catch (err) {
      console.error("enforcePlanFeature error:", err);
      return res.status(500).json({
        success: false,
        message: "Server error while checking plan limits.",
      });
    }
  };
};
