import express from "express";
import AppointmentController from "../controllers/AppointmentController.js";
import { protect, restrictTo } from "../middlewares/authMiddleware.js";

const appointmentRouter = express.Router();

// All appointment routes require authentication
appointmentRouter.use(protect);

// Create appointment
appointmentRouter.post(
  "/",
  restrictTo("PATIENT", "CLINIC_ADMIN"),
  AppointmentController.create
);

// Logged-in user's appointments
appointmentRouter.get(
  "/my-appointments",
  restrictTo("CLINIC_ADMIN", "PATIENT"),
  AppointmentController.getMyAppointments
);

// Tenant-wide registry (admin view)
appointmentRouter.get(
  "/",
  restrictTo("CLINIC_ADMIN"),
  AppointmentController.getAll
);

// Update appointment status (admin)
appointmentRouter.patch(
  "/:id/status",
  restrictTo("CLINIC_ADMIN"),
  AppointmentController.updateStatus
);

export default appointmentRouter;
