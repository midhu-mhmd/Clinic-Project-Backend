import cron from "node-cron";
import Appointment from "../models/appointmentModel.js";
import { sendEmail } from "../utils/emailService.js";
import { videoReminderTemplate } from "../utils/emailTemplates.js";
import NotificationService from "../services/notificationService.js";

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
 * Find video appointments starting in ~5 minutes that
 * haven't had their reminder sent yet, then:
 *   1) Email the meeting link to the doctor
 *   2) Email the meeting link to the patient
 *   3) Send an in-app notification to the patient with the meeting link
 *
 * Only marks reminderSent = true when at least one notification succeeds.
 * Runs every minute via node-cron.
 *
 * @param {boolean} verbose - If true, logs detailed debug info (used by manual trigger)
 */
const sendVideoReminders = async (verbose = false) => {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 4.5 * 60 * 1000); // +4.5 min
    const windowEnd = new Date(now.getTime() + 5.5 * 60 * 1000);   // +5.5 min

    const shouldLog = verbose || now.getMinutes() % 5 === 0;

    if (shouldLog) {
      console.log(`[Reminder] ⏰ Heartbeat — now=${now.toISOString()}, scanning window ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);
    }

    // ── 1) UPCOMING: Appointments in the ~5 min future window ──
    const upcomingAppointments = await Appointment.find({
      consultationType: "video",
      reminderSent: false,
      status: { $in: ["PENDING", "CONFIRMED"] },
      meetingLink: { $exists: true, $nin: ["", null] },
      dateTime: { $gte: windowStart, $lte: windowEnd },
    })
      .populate("doctorId", "name email")
      .populate("patientId", "name email")
      .lean();

    // ── 2) MISSED: Past appointments where reminder was never sent ──
    //    (dateTime already passed but within last 24 hours — don't spam very old ones)
    const missedCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const missedAppointments = await Appointment.find({
      consultationType: "video",
      reminderSent: false,
      status: { $in: ["PENDING", "CONFIRMED"] },
      meetingLink: { $exists: true, $nin: ["", null] },
      dateTime: { $gte: missedCutoff, $lt: now },
    })
      .populate("doctorId", "name email")
      .populate("patientId", "name email")
      .lean();

    const appointments = [...upcomingAppointments, ...missedAppointments];

    if (shouldLog) {
      console.log(`[Reminder] Found ${upcomingAppointments.length} upcoming + ${missedAppointments.length} missed = ${appointments.length} total to process`);
    }

    if (!appointments.length) {
      return { sent: 0, upcoming: 0, missed: 0 };
    }

    console.log(`[Reminder] Processing ${appointments.length} video appointment(s)...`);

    for (const appt of appointments) {
      const doctorName = appt.doctorId?.name || "Doctor";
      const doctorEmail = appt.doctorId?.email;
      const patientName = appt.patientInfo?.name || appt.patientId?.name || "Patient";
      const patientEmail = appt.patientInfo?.email || appt.patientId?.email;
      const dateTimeStr = formatDateTime(appt.dateTime);
      const patientLink = appt.meetingLink;
      const doctorLink = appt.doctorMeetingLink || appt.meetingLink;
      const isPast = new Date(appt.dateTime).getTime() < now.getTime();
      const emailSubject = isPast
        ? "Your Video Consultation is Ready — Sovereign HealthBook"
        : "Video Consultation in 5 Minutes — Sovereign HealthBook";
      const notifTitle = isPast
        ? "Video Consultation — Join Now"
        : "Video Consultation in 5 Minutes";
      const notifMessage = isPast
        ? `Your video consultation with Dr. ${doctorName} is ready. Click to join the call now.`
        : `Your video consultation with Dr. ${doctorName} starts in 5 minutes. Click to join the call.`;

      let successCount = 0;

      // 1) Email meeting link to doctor
      if (doctorEmail) {
        try {
          await sendEmail({
            to: doctorEmail,
            subject: emailSubject,
            html: videoReminderTemplate(
              doctorName.split(" ")[0],
              "Doctor",
              patientName,
              dateTimeStr,
              doctorLink
            ),
          });
          successCount++;
          console.log(`[Reminder] Doctor email sent to ${doctorEmail}`);
        } catch (err) {
          console.error(`[Reminder] Doctor email failed (${doctorEmail}):`, err.message);
        }
      } else {
        console.warn(`[Reminder] No doctor email found for appointment ${appt._id}`);
      }

      // 2) Email meeting link to patient
      if (patientEmail) {
        try {
          await sendEmail({
            to: patientEmail,
            subject: emailSubject,
            html: videoReminderTemplate(
              patientName.split(" ")[0],
              "Patient",
              doctorName,
              dateTimeStr,
              patientLink
            ),
          });
          successCount++;
          console.log(`[Reminder] Patient email sent to ${patientEmail}`);
        } catch (err) {
          console.error(`[Reminder] Patient email failed (${patientEmail}):`, err.message);
        }
      } else {
        console.warn(`[Reminder] No patient email found for appointment ${appt._id}`);
      }

      // 3) In-app notification with meeting link to patient
      if (appt.patientId?._id) {
        try {
          await NotificationService.create({
            recipient: appt.patientId._id,
            type: "REMINDER",
            title: notifTitle,
            message: notifMessage,
            meta: { appointmentId: appt._id, meetingLink: patientLink },
            link: patientLink,
          });
          successCount++;
          console.log(`[Reminder] Patient in-app notification created for ${patientName}`);
        } catch (err) {
          console.error(`[Reminder] Patient notification failed:`, err.message);
        }
      } else {
        console.warn(`[Reminder] No patientId found for appointment ${appt._id}`);
      }

      // 4) In-app notification to clinic admin (so doctor gets notified via dashboard)
      if (appt.tenantId) {
        try {
          const Tenant = (await import("../models/tenantModel.js")).default;
          const tenant = await Tenant.findById(appt.tenantId).select("ownerId").lean();
          if (tenant?.ownerId) {
            const doctorNotifMessage = isPast
              ? `Video consultation with ${patientName} is ready. Click to join now.`
              : `Video consultation with ${patientName} starts in 5 minutes. Get ready to join.`;
            await NotificationService.create({
              recipient: tenant.ownerId,
              type: "REMINDER",
              title: notifTitle,
              message: doctorNotifMessage,
              meta: { appointmentId: appt._id, meetingLink: doctorLink },
              link: doctorLink,
            });
            successCount++;
            console.log(`[Reminder] Clinic admin in-app notification created for tenant ${appt.tenantId}`);
          }
        } catch (err) {
          console.error(`[Reminder] Clinic admin notification failed:`, err.message);
        }
      }

      // Only mark as sent if at least one notification succeeded
      if (successCount > 0) {
        await Appointment.updateOne(
          { _id: appt._id },
          { $set: { reminderSent: true } }
        );
        console.log(
          `[Reminder] ✅ Sent ${successCount}/4 notifications for appointment ${appt._id} at ${dateTimeStr}`
        );
      } else {
        console.error(
          `[Reminder] ❌ All notifications failed for appointment ${appt._id} — will retry next cycle`
        );
      }
    }

    return { sent: appointments.length, upcoming: upcomingAppointments.length, missed: missedAppointments.length };
  } catch (err) {
    console.error("[Reminder] Scheduler error:", err.message);
    return { error: err.message };
  }
};

/**
 * Start the cron job — call once after DB is connected.
 * Runs every minute: "* * * * *"
 */
/**
 * Manually trigger the reminder check (verbose mode).
 * Used by the debug API route.
 */
export const triggerVideoReminders = () => sendVideoReminders(true);

export const startVideoReminderScheduler = async () => {
  // Startup diagnostic: check for any pending video appointments
  try {
    const pendingVideo = await Appointment.countDocuments({
      consultationType: "video",
      reminderSent: false,
      status: { $in: ["PENDING", "CONFIRMED"] },
    });
    const withMeetingLink = await Appointment.countDocuments({
      consultationType: "video",
      reminderSent: false,
      status: { $in: ["PENDING", "CONFIRMED"] },
      meetingLink: { $exists: true, $nin: ["", null] },
    });
    console.log(`⏰ Video reminder scheduler started (every 1 min)`);
    console.log(`   └─ Pending video appointments: ${pendingVideo} total, ${withMeetingLink} with meeting links`);
  } catch (err) {
    console.log("⏰ Video reminder scheduler started (every 1 min)");
    console.warn("   └─ Could not run startup diagnostic:", err.message);
  }

  // Run immediately once on startup, then every minute
  sendVideoReminders().catch((err) =>
    console.error("[Reminder] Initial run error:", err.message)
  );

  cron.schedule("* * * * *", sendVideoReminders);
};
