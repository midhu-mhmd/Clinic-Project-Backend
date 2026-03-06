import express from "express";
import AppointmentController from "../controllers/AppointmentController.js";
import { protect, restrictTo } from "../middlewares/authMiddleware.js";
import { triggerVideoReminders } from "../scheduler/videoReminder.js";
import Appointment from "../models/appointmentModel.js";

const appointmentRouter = express.Router();

// Public route — no auth required
appointmentRouter.get(
  "/booked-slots",
  AppointmentController.getBookedSlots
);

// Debug route: manually trigger the 5-min video reminder check
appointmentRouter.get("/debug/trigger-reminders", async (req, res) => {
  try {
    console.log("[Debug] Manually triggering video reminder check...");
    const result = await triggerVideoReminders();
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Debug route: check reminder status of video appointments
appointmentRouter.get("/debug/reminder-status", async (req, res) => {
  try {
    const appointments = await Appointment.find({ consultationType: "video" })
      .select("dateTime status reminderSent meetingLink patientInfo.name patientInfo.email")
      .populate("doctorId", "name email")
      .sort({ dateTime: -1 })
      .limit(20)
      .lean();
    return res.json({
      success: true,
      count: appointments.length,
      data: appointments.map((a) => ({
        id: a._id,
        dateTime: a.dateTime,
        status: a.status,
        reminderSent: a.reminderSent,
        hasMeetingLink: !!a.meetingLink,
        doctorName: a.doctorId?.name,
        doctorEmail: a.doctorId?.email,
        patientName: a.patientInfo?.name,
        patientEmail: a.patientInfo?.email,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 🛡️ All appointment routes below REQUIRE a full "AUTH" token
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