import express from "express";
import AppointmentController from "../controllers/AppointmentController.js";
import { protect, restrictTo } from "../middlewares/authMiddleware.js";

const appointmentRouter = express.Router();

// 🛡️ All appointment routes REQUIRE a full "AUTH" token
appointmentRouter.use(protect);

// 1. Specific static routes FIRST
appointmentRouter.get(
  "/my-appointments",
  restrictTo("CLINIC_ADMIN", "PATIENT"),
  AppointmentController.getMyAppointments
);

// 2. Resource collection routes
appointmentRouter.post(
  "/",
  restrictTo("PATIENT", "CLINIC_ADMIN"),
  AppointmentController.create
);

appointmentRouter.get(
  "/",
  restrictTo("CLINIC_ADMIN"),
  AppointmentController.getAll
);

// 3. Dynamic ID routes LAST
appointmentRouter.patch(
  "/:id/status",
  restrictTo("CLINIC_ADMIN"),
  AppointmentController.updateStatus
);

// If you ever add a "Get Single Appointment", put it here at the very end:
// appointmentRouter.get("/:id", AppointmentController.getOne);

export default appointmentRouter;