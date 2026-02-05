import mongoose from "mongoose";
import Plan from "../models/planModel.js";

/**
 * AppError: lightweight, controller-friendly errors
 * - statusCode: for HTTP response mapping
 * - code: optional internal error code
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * PlanService
 * Business logic for subscription tiers.
 * Principles:
 * - Read-heavy endpoints use .lean()
 * - Writes use validators + conflict-safe behavior
 * - Never fetch full docs unless necessary
 */
class PlanService {
  /**
   * PUBLIC: Pricing page plans (active only, sorted).
   * Uses model static optimized by index + lean.
   */
  async getActivePlans() {
    return Plan.getPublicTiers(); // already lean + sorted
  }

  /**
   * ADMIN: All plans (including inactive).
   */
  async getAllPlans() {
    return Plan.find()
      .sort({ tierLevel: 1 })
      .lean();
  }

  /**
   * SYSTEM: get a plan by MongoDB ObjectId
   */
  async getPlanById(planId) {
    if (!mongoose.Types.ObjectId.isValid(String(planId))) {
      throw new AppError("Invalid plan reference.", 400, "INVALID_ID");
    }

    const plan = await Plan.findById(planId).lean();
    if (!plan) {
      throw new AppError("Plan not found.", 404, "PLAN_NOT_FOUND");
    }

    return plan;
  }

  /**
   * SYSTEM: get active plan by slug
   */
  async getPlanBySlug(slug) {
    const safeSlug = String(slug || "").trim().toLowerCase();
    if (!safeSlug) {
      throw new AppError("Slug is required.", 400, "SLUG_REQUIRED");
    }

    const plan = await Plan.findOne({ slug: safeSlug, isActive: true }).lean();
    if (!plan) {
      throw new AppError("Plan not found or inactive.", 404, "PLAN_NOT_FOUND");
    }
    return plan;
  }

  /**
   * ADMIN: Create plan
   * - Avoids extra pre-check query (race-condition prone)
   * - Relies on unique indexes, maps duplicate key to 409
   */
  async createPlan(planData) {
    if (!planData || typeof planData !== "object") {
      throw new AppError("Plan data is required.", 400, "INVALID_PAYLOAD");
    }

    const payload = this.#sanitizePlanPayload(planData);

    try {
      const created = await Plan.create(payload);
      return created.toObject ? created.toObject() : created;
    } catch (err) {
      // Duplicate key (name / slug / tierLevel)
      if (err?.code === 11000) {
        const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || "field";
        throw new AppError(
          `Conflict: Duplicate value for "${field}".`,
          409,
          "DUPLICATE_KEY"
        );
      }
      // Validation errors
      if (err?.name === "ValidationError") {
        throw new AppError(err.message, 400, "VALIDATION_ERROR");
      }
      throw err;
    }
  }

  /**
   * ADMIN: Update plan
   * - Uses runValidators to enforce schema
   * - Prevents accidental changes to immutable fields if desired (optional)
   */
  async updatePlan(planId, updateData) {
    if (!mongoose.Types.ObjectId.isValid(String(planId))) {
      throw new AppError("Invalid plan reference.", 400, "INVALID_ID");
    }
    if (!updateData || typeof updateData !== "object") {
      throw new AppError("Update data is required.", 400, "INVALID_PAYLOAD");
    }

    const payload = this.#sanitizePlanPayload(updateData, { partial: true });

    try {
      const updated = await Plan.findByIdAndUpdate(planId, payload, {
        new: true,
        runValidators: true,
      }).lean();

      if (!updated) {
        throw new AppError("Plan not found.", 404, "PLAN_NOT_FOUND");
      }

      return updated;
    } catch (err) {
      if (err?.code === 11000) {
        const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || "field";
        throw new AppError(
          `Conflict: Duplicate value for "${field}".`,
          409,
          "DUPLICATE_KEY"
        );
      }
      if (err?.name === "ValidationError") {
        throw new AppError(err.message, 400, "VALIDATION_ERROR");
      }
      throw err;
    }
  }

  /**
   * ADMIN: Soft-archive plan (no hard delete)
   */
  async archivePlan(planId) {
    return this.updatePlan(planId, { isActive: false });
  }

  /**
   * SYSTEM: Limit Enforcement (fast, no full doc needed)
   * - Works with either planId (ObjectId) or planName (string),
   *   depending on how you store it in tenant subscription.
   *
   * @param {Object} args
   * @param {string} args.planId - Optional: Plan ObjectId
   * @param {string} args.planName - Optional: plan name like "PRO"
   * @param {string} args.limitKey - e.g. "maxDoctors"
   * @param {number} args.currentUsage
   * @returns {boolean}
   */
  async checkLimit({ planId, planName, limitKey, currentUsage }) {
    if (!limitKey) {
      throw new AppError("limitKey is required.", 400, "LIMITKEY_REQUIRED");
    }
    if (typeof currentUsage !== "number" || currentUsage < 0) {
      throw new AppError("currentUsage must be a non-negative number.", 400, "INVALID_USAGE");
    }

    const query = {};

    if (planId) {
      if (!mongoose.Types.ObjectId.isValid(String(planId))) {
        throw new AppError("Invalid planId.", 400, "INVALID_ID");
      }
      query._id = planId;
    } else if (planName) {
      query.name = String(planName).trim().toUpperCase();
    } else {
      throw new AppError("Either planId or planName is required.", 400, "PLAN_REF_REQUIRED");
    }

    // Only enforce active plans (usually business expectation)
    query.isActive = true;

    const plan = await Plan.findOne(query)
      .select(`limits.${limitKey} name`)
      .lean();

    if (!plan) return false;

    const limit = plan?.limits?.[limitKey];

    // Unlimited convention
    if (limit === -1) return true;

    // Defensive: bad config
    if (typeof limit !== "number" || limit < 0) return false;

    return currentUsage < limit;
  }

  /**
   * INTERNAL: Get plan limits quickly
   * Useful for middleware/service enforcement without fetching whole plan.
   */
  async getLimits({ planId, planName }) {
    const query = {};

    if (planId) {
      if (!mongoose.Types.ObjectId.isValid(String(planId))) {
        throw new AppError("Invalid planId.", 400, "INVALID_ID");
      }
      query._id = planId;
    } else if (planName) {
      query.name = String(planName).trim().toUpperCase();
    } else {
      throw new AppError("Either planId or planName is required.", 400, "PLAN_REF_REQUIRED");
    }

    query.isActive = true;

    const plan = await Plan.findOne(query)
      .select("name slug tierLevel limits isActive")
      .lean();

    if (!plan) throw new AppError("Plan not found or inactive.", 404, "PLAN_NOT_FOUND");
    return plan;
  }

  /**
   * PRIVATE: sanitize payload for create/update
   * - uppercase plan names to keep data consistent
   * - supports partial updates
   */
  #sanitizePlanPayload(data, { partial = false } = {}) {
    const out = { ...data };

    if (!partial || Object.prototype.hasOwnProperty.call(out, "name")) {
      if (out.name != null) out.name = String(out.name).trim().toUpperCase();
    }

    if (!partial || Object.prototype.hasOwnProperty.call(out, "slug")) {
      // Normally slug is generated by schema middleware; allow update only if you intentionally support it
      if (out.slug != null) out.slug = String(out.slug).trim().toLowerCase();
    }

    // Normalize currency if present
    if (out.price?.currency != null) {
      out.price = { ...out.price, currency: String(out.price.currency).trim().toUpperCase() };
    }

    return out;
  }
}

export { AppError };
export default new PlanService();
