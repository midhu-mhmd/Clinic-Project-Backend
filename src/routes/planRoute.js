import express from "express";
import {
  getPublicPlans,
  getPlan,
  createPlan,
  updatePlan,
  archivePlan,
} from "../controllers/planController.js";

// Middleware imports
import { protect, restrictTo } from "../middlewares/authMiddleware.js";
// import { validatePlan, validatePlanUpdate } from "../middlewares/validators/planValidator.js";

const router = express.Router();

/**
 * @route   GET /api/v1/plans
 * @desc    Fetch available subscription tiers for landing/pricing pages
 * @access  Public
 */
router.get("/", getPublicPlans);

/**
 * @route   GET /api/v1/plans/:id
 * @desc    Fetch specific plan details by ID or Slug
 * @access  Public
 */
router.get("/:id", getPlan);

/* -------------------------------------------------------------------------- */
/* ADMINISTRATIVE AREA                             */
/* -------------------------------------------------------------------------- */

// Apply protection to all subsequent routes
router.use(protect);
router.use(restrictTo("super-admin"));

/**
 * @route   POST /api/v1/plans
 * @desc    Create a new subscription tier
 * @access  Private (Super-Admin)
 */
router.post("/", createPlan);

/**
 * @route   PATCH /api/v1/plans/:id
 * @desc    Update specific fields of an existing plan
 * @access  Private (Super-Admin)
 */
router.patch("/:id", updatePlan);

/**
 * @route   DELETE /api/v1/plans/:id
 * @desc    Decommission/Archive a plan (Soft Delete)
 * @access  Private (Super-Admin)
 */
router.delete("/:id", archivePlan);

export default router;