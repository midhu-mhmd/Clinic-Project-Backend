import express from "express";
import {
    getStats,
    updateTenantStatus,
    getTenantDetails,
    deleteTenant,
    impersonateTenant,
    clearTenantCache,
    getAllTenants,
    changeAdminPassword,
    getAdminNotifications,
    getUserDetails,
    updateUserStatus,
    deleteUser
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

// USER MANAGEMENT
adminRouter.get("/users/:id", getUserDetails);
adminRouter.patch("/users/:id/status", updateUserStatus);
adminRouter.delete("/users/:id", deleteUser);

// ADMIN SETTINGS
adminRouter.get("/settings/profile", getAdminProfile);
adminRouter.put("/settings/profile", updateAdminProfile);
adminRouter.put("/settings/change-password", changeAdminPassword);

// NOTIFICATIONS
adminRouter.get("/notifications", getAdminNotifications);

export default adminRouter;