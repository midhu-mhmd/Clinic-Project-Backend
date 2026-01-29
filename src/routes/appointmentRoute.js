import express from "express";
import AppointmentController from "../controllers/appointmentController.js";
import { protect, restrictTo } from "../middlewares/authMiddleware.js";

const appointmentRouter = express.Router();

// All appointment routes require auth
appointmentRouter.use(protect);

/**
 * Logged-in user's appointments:
 * - CLINIC_ADMIN => all tenant appointments (controller handles this)
 * - PATIENT      => only own appointments
 */
appointmentRouter.get("/my-appointments", AppointmentController.getMyAppointments);

/**
 * Create appointment (patient-side booking by default in controller)
 */
appointmentRouter.post("/", AppointmentController.create);

/**
 * Tenant-wide registry (admin/staff view)
 * IMPORTANT: Your token role is "CLINIC_ADMIN" (not "admin")
 */
appointmentRouter.get(
  "/",
  restrictTo("CLINIC_ADMIN", "STAFF"), // add/remove based on your roles
  AppointmentController.getAll
);

/**
 * Update appointment status (admin/staff)
 */
appointmentRouter.patch(
  "/:id/status",
  restrictTo("CLINIC_ADMIN", "STAFF"),
  AppointmentController.updateStatus
);

export default appointmentRouter;