import express from "express";
import {
  getPublicPlans,
  getPlan,
  createPlan,
  updatePlan,
  archivePlan,
} from "../controllers/planController.js";

import { protect, restrictTo } from "../middlewares/authMiddleware.js";

// Optional validation middleware (recommended)
// import {
//   validateCreatePlan,
//   validateUpdatePlan,
//   validateObjectIdParam,
// } from "../middlewares/validators/planValidator.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* PUBLIC ROUTES                                                              */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/v1/plans
 * Public pricing tiers (active only)
 */
router.get("/", getPublicPlans);

/**
 * Recommended: Separate slug endpoint
 * GET /api/v1/plans/slug/:slug
 * This avoids ambiguity between ObjectId and slug.
 *
 * If you implement this, add controller method getPlanBySlug
 * router.get("/slug/:slug", getPlanBySlug);
 */

/**
 * GET /api/v1/plans/:planId
 * Public plan details by Mongo ObjectId
 *
 * NOTE:
 * - Kept as ObjectId only to prevent collisions/ambiguity.
 * - Validation middleware recommended.
 */
// router.get("/:planId", validateObjectIdParam("planId"), getPlan);
router.get("/:planId", getPlan);

/* -------------------------------------------------------------------------- */
/* ADMIN ROUTES (Protected + RBAC)                                            */
/* -------------------------------------------------------------------------- */

router.use(protect);
router.use(restrictTo("super-admin"));

/**
 * POST /api/v1/plans
 * Create new plan tier
 */
// router.post("/", validateCreatePlan, createPlan);
router.post("/", createPlan);

/**
 * PATCH /api/v1/plans/:planId
 * Partial update for plan
 */
// router.patch("/:planId", validateObjectIdParam("planId"), validateUpdatePlan, updatePlan);
router.patch("/:planId", updatePlan);

/**
 * DELETE /api/v1/plans/:planId
 * Soft-archive plan
 */
// router.delete("/:planId", validateObjectIdParam("planId"), archivePlan);
router.delete("/:planId", archivePlan);

export default router;
