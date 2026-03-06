import cron from "node-cron";
import Appointment from "../models/appointmentModel.js";
import { sendEmail } from "../utils/emailService.js";
import { videoReminderTemplate } from "../utils/emailTemplates.js";

/**
 * Format a Date to a human-readable string like "06 Mar 2026, 02:30 PM"
 */
const formatDateTime = (dt) => {
  const d = new Date(dt);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * Find video appointments starting in the next 9–12 minutes that
 * haven't had their reminder email sent yet, then email both the
 * doctor and the patient with the meeting link.
 *
 * Runs every minute via node-cron.
 */
const sendVideoReminders = async () => {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 9 * 60 * 1000); // +9 min
    const windowEnd = new Date(now.getTime() + 12 * 60 * 1000);  // +12 min

    const appointments = await Appointment.find({
      consultationType: "video",
      reminderSent: false,
      status: { $in: ["PENDING", "CONFIRMED"] },
      meetingLink: { $ne: "" },
      dateTime: { $gte: windowStart, $lte: windowEnd },
    })
      .populate("doctorId", "name email")
      .populate("patientId", "name email")
      .lean();

    if (!appointments.length) return;

    for (const appt of appointments) {
      const doctorName = appt.doctorId?.name || "Doctor";
      const doctorEmail = appt.doctorId?.email;
      const patientName = appt.patientInfo?.name || appt.patientId?.name || "Patient";
      const patientEmail = appt.patientInfo?.email || appt.patientId?.email;
      const dateTimeStr = formatDateTime(appt.dateTime);
      const link = appt.meetingLink;

      const emailPromises = [];

      // Email to doctor
      if (doctorEmail) {
        emailPromises.push(
          sendEmail({
            to: doctorEmail,
            subject: "Video Consultation in 10 Minutes — Sovereign Healthbook",
            html: videoReminderTemplate(
              doctorName.split(" ")[0],
              "Doctor",
              patientName,
              dateTimeStr,
              link
            ),
          }).catch((err) =>
            console.error(`[Reminder] Doctor email failed (${doctorEmail}):`, err.message)
          )
        );
      }

      // Email to patient
      if (patientEmail) {
        emailPromises.push(
          sendEmail({
            to: patientEmail,
            subject: "Your Video Consultation Starts in 10 Minutes — Sovereign Healthbook",
            html: videoReminderTemplate(
              patientName.split(" ")[0],
              "Patient",
              `Dr. ${doctorName}`,
              dateTimeStr,
              link
            ),
          }).catch((err) =>
            console.error(`[Reminder] Patient email failed (${patientEmail}):`, err.message)
          )
        );
      }

      await Promise.all(emailPromises);

      // Mark as sent so we don't email again
      await Appointment.updateOne(
        { _id: appt._id },
        { $set: { reminderSent: true } }
      );

      console.log(
        `[Reminder] Sent for appointment ${appt._id} at ${dateTimeStr}`
      );
    }
  } catch (err) {
    console.error("[Reminder] Scheduler error:", err.message);
  }
};

/**
 * Start the cron job — call once after DB is connected.
 * Runs every minute: "* * * * *"
 */
export const startVideoReminderScheduler = () => {
  cron.schedule("* * * * *", sendVideoReminders);
  console.log("⏰ Video reminder scheduler started (every 1 min)");
};
