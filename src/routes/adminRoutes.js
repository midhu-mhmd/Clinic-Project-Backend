import express from "express";
import {
    getStats,
    updateTenantStatus,
    getTenantDetails,
    deleteTenant,
    impersonateTenant,
    clearTenantCache,
    getAllTenants,
    getAdminProfile,
    updateAdminProfile,
    changeAdminPassword,
    getAdminNotifications
} from "../controllers/adminController.js";
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

// TENANT MANAGEMENT
adminRouter.get("/tenants", getAllTenants);
adminRouter.get("/tenants/:id", getTenantDetails);
adminRouter.patch("/tenants/:id/status", updateTenantStatus);
adminRouter.delete("/tenants/:id", deleteTenant);
adminRouter.post("/tenants/:id/impersonate", impersonateTenant);
adminRouter.post("/tenants/:id/clear-cache", clearTenantCache);

// ADMIN SETTINGS
adminRouter.get("/settings/profile", getAdminProfile);
adminRouter.put("/settings/profile", updateAdminProfile);
adminRouter.put("/settings/change-password", changeAdminPassword);

// NOTIFICATIONS
adminRouter.get("/notifications", getAdminNotifications);

export default adminRouter;