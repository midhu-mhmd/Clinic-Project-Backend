import express from "express";
import { getStats, updateTenantStatus } from "../controllers/adminController.js";
import { protect, authorize } from "../middlewares/authMiddleware.js";

const adminRouter = express.Router();

/**
 * All routes in this file are protected.
 * 'protect' verifies the JWT token.
 * 'authorize' ensures only 'SUPER_ADMIN' can proceed.
 */
adminRouter.use(protect);
adminRouter.use(authorize("SUPER_ADMIN"));

// GET /api/admin/stats
adminRouter.get("/stats", getStats);

// PATCH /api/admin/tenants/:id/status
adminRouter.patch("/tenants/:id/status", updateTenantStatus);

export default adminRouter;