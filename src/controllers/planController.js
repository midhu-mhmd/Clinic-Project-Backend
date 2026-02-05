import PlanService, { AppError } from "../services/planService.js";

/**
 * Small helper to avoid repeating try/catch in every controller
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Standard API response helpers
 */
const ok = (res, payload) => res.status(200).json(payload);
const created = (res, payload) => res.status(201).json(payload);

/**
 * Centralized error-to-response mapping.
 * If you already have a global Express error middleware, you can remove this
 * and simply `next(err)` everywhere (which asyncHandler already does).
 */
const sendError = (res, err, fallbackMessage = "Internal server error") => {
  // AppError from service layer (preferred)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
    });
  }

  // Mongoose duplicate key (just in case something bubbles up)
  if (err?.code === 11000) {
    return res.status(409).json({
      success: false,
      code: "DUPLICATE_KEY",
      message: "Duplicate entry: a plan with this unique field already exists.",
      ...(process.env.NODE_ENV !== "production" ? { details: err.keyValue } : {}),
    });
  }

  // Mongoose validation errors
  if (err?.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: err.message,
      ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
    });
  }

  console.error("[PlanController Error]", err);
  return res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: fallbackMessage,
    ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
  });
};

/**
 * @desc    Get all active plans (Pricing Page)
 * @route   GET /api/plans
 * @access  Public
 *
 * Optional (future-proof): supports ?page=1&limit=10
 * For now, default returns all active plans (since usually only 3 tiers).
 */
export const getPublicPlans = asyncHandler(async (req, res) => {
  try {
    const plans = await PlanService.getActivePlans();

    return ok(res, {
      success: true,
      results: plans.length,
      data: plans,
    });
  } catch (err) {
    return sendError(res, err, "Pricing retrieval failed.");
  }
});

/**
 * @desc    Get single plan details by id
 * @route   GET /api/plans/:id
 * @access  Public
 */
export const getPlan = asyncHandler(async (req, res) => {
  try {
    const plan = await PlanService.getPlanById(req.params.id);

    return ok(res, {
      success: true,
      data: plan,
    });
  } catch (err) {
    return sendError(res, err, "Failed to retrieve plan.");
  }
});

/**
 * @desc    Create new subscription plan
 * @route   POST /api/plans
 * @access  Private (Super Admin)
 */
export const createPlan = asyncHandler(async (req, res) => {
  try {
    const newPlan = await PlanService.createPlan(req.body);

    return created(res, {
      success: true,
      message: "Plan created successfully.",
      data: newPlan,
    });
  } catch (err) {
    return sendError(res, err, "Plan creation failed.");
  }
});

/**
 * @desc    Update plan details (partial)
 * @route   PATCH /api/plans/:id
 * @access  Private (Super Admin)
 */
export const updatePlan = asyncHandler(async (req, res) => {
  try {
    const updatedPlan = await PlanService.updatePlan(req.params.id, req.body);

    return ok(res, {
      success: true,
      message: "Plan updated successfully.",
      data: updatedPlan,
    });
  } catch (err) {
    return sendError(res, err, "Plan update failed.");
  }
});

/**
 * @desc    Archive a plan (soft delete)
 * @route   DELETE /api/plans/:id
 * @access  Private (Super Admin)
 */
export const archivePlan = asyncHandler(async (req, res) => {
  try {
    await PlanService.archivePlan(req.params.id);

    return ok(res, {
      success: true,
      message: "Plan archived successfully.",
      data: null,
    });
  } catch (err) {
    return sendError(res, err, "Plan archive failed.");
  }
});
