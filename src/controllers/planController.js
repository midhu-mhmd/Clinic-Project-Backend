import PlanService from "../services/planService.js";

/**
 * @desc    Get all active plans (For Pricing Page)
 * @route   GET /api/v1/plans
 * @access  Public
 */
export const getPublicPlans = async (req, res) => {
  try {
    const plans = await PlanService.getActivePlans();
    
    // Performance Note: 200 OK responses with arrays should always include count
    return res.status(200).json({
      success: true,
      results: plans.length,
      data: plans,
    });
  } catch (error) {
    return handleControllerError(res, error, "Pricing retrieval failed.");
  }
};

/**
 * @desc    Get single plan details
 * @route   GET /api/v1/plans/:id
 * @access  Public
 */
export const getPlan = async (req, res) => {
  try {
    const plan = await PlanService.getPlanById(req.params.id);

    return res.status(200).json({
      success: true,
      data: plan,
    });
  } catch (error) {
    // Service throws specific error if not found, caught here
    const statusCode = error.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Create new subscription plan
 * @route   POST /api/v1/plans
 * @access  Private (Super Admin)
 */
export const createPlan = async (req, res) => {
  try {
    const newPlan = await PlanService.createPlan(req.body);

    return res.status(201).json({
      success: true,
      message: "Resource created successfully.",
      data: newPlan,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate entry: A plan with this name or slug already exists.",
      });
    }
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Update plan details
 * @route   PATCH /api/v1/plans/:id
 * @access  Private (Super Admin)
 */
export const updatePlan = async (req, res) => {
  try {
    // We use PATCH for partial updates, PUT for full replacements
    const updatedPlan = await PlanService.updatePlan(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: "Resource updated successfully.",
      data: updatedPlan,
    });
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Archive a plan (Soft Delete)
 * @route   DELETE /api/v1/plans/:id
 * @access  Private (Super Admin)
 */
export const archivePlan = async (req, res) => {
  try {
    await PlanService.archivePlan(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Plan has been decommissioned and archived.",
      data: null,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Helper: Centralized Controller Error Handler
 * In a real-world app, this would be part of a global middleware
 */
const handleControllerError = (res, error, customMsg) => {
  console.error(`[Controller Error]: ${error.message}`);
  return res.status(500).json({
    success: false,
    message: customMsg || "An internal server error occurred.",
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  });
};