import cron from "node-cron";
import Ticket from "../models/ticketModel.js";
import User from "../models/userModel.js";
import NotificationService from "../services/notificationService.js";

const PRIORITY_ESCALATION = { LOW: "MEDIUM", MEDIUM: "HIGH", HIGH: "URGENT" };

// ── 1. First Response Breach ──
const checkFirstResponseBreaches = async () => {
  try {
    const now = new Date();

    const breached = await Ticket.find({
      firstResponseBreached: false,
      firstRespondedAt: null,
      firstResponseDeadline: { $lte: now },
      slaPausedAt: null, // skip paused tickets
      status: { $nin: ["RESOLVED", "CLOSED"] },
    });

    if (breached.length === 0) return;

    console.log(`[SLA] First-response breach: ${breached.length} ticket(s)`);

    for (const ticket of breached) {
      ticket.firstResponseBreached = true;
      await ticket.save();

      // Notify the assignee that they missed the response window
      if (ticket.assignedTo) {
        NotificationService.create({
          recipient: ticket.assignedTo,
          type: "TICKET",
          title: "First Response SLA Breached",
          message: `Ticket #${ticket.ticketNumber} has not received a first response within the SLA window.`,
          meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[SLA] First-response check error:", err.message);
  }
};

// ── 2. Resolution Warning (Level 1 — 75% of deadline) ──
const checkResolutionWarnings = async () => {
  try {
    const now = new Date();

    // Find tickets at escalation level 0 that are past 75% of their SLA window
    const candidates = await Ticket.find({
      escalationLevel: 0,
      slaBreached: false,
      slaPausedAt: null,
      status: { $nin: ["RESOLVED", "CLOSED"] },
      slaDeadline: { $ne: null },
    });

    if (candidates.length === 0) return;

    let warned = 0;
    for (const ticket of candidates) {
      const created = ticket.createdAt.getTime() + ticket.totalPausedMs;
      const deadline = ticket.slaDeadline.getTime();
      const totalWindow = deadline - created;
      const elapsed = now.getTime() - created;

      // Trigger at 75% of the resolution window
      if (totalWindow > 0 && elapsed >= totalWindow * 0.75) {
        ticket.escalationLevel = 1;
        await ticket.save();
        warned++;

        // Warn the assignee
        if (ticket.assignedTo) {
          const minsLeft = Math.max(0, Math.round((deadline - now.getTime()) / 60000));
          NotificationService.create({
            recipient: ticket.assignedTo,
            type: "TICKET",
            title: "SLA Deadline Approaching",
            message: `Ticket #${ticket.ticketNumber} has ~${minsLeft} min remaining before SLA breach. Priority: ${ticket.priority}.`,
            meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber, priority: ticket.priority },
          }).catch(() => {});
        }
      }
    }

    if (warned > 0) console.log(`[SLA] Warning sent for ${warned} ticket(s)`);
  } catch (err) {
    console.error("[SLA] Resolution warning check error:", err.message);
  }
};

// ── 3. Resolution Breach (Level 2 — escalate priority + re-route) ──
const checkResolutionBreaches = async () => {
  try {
    const now = new Date();

    const breachedTickets = await Ticket.find({
      slaBreached: false,
      slaDeadline: { $lte: now },
      slaPausedAt: null,
      status: { $nin: ["RESOLVED", "CLOSED"] },
    });

    if (breachedTickets.length === 0) return;

    console.log(`[SLA] Resolution breach: ${breachedTickets.length} ticket(s)`);

    const superAdmin = await User.findOne({ role: "SUPER_ADMIN" }).select("_id").lean();

    for (const ticket of breachedTickets) {
      ticket.slaBreached = true;
      ticket.escalationLevel = 2;
      ticket.escalatedAt = now;

      // Escalate priority one level
      const newPriority = PRIORITY_ESCALATION[ticket.priority];
      if (newPriority) ticket.priority = newPriority;

      // Re-route breached tenant tickets to super admin
      if (ticket.routedTo === "TENANT") {
        ticket.routedTo = "SUPER_ADMIN";
        if (superAdmin) ticket.assignedTo = superAdmin._id;
      }

      await ticket.save();

      // Notify super admin
      if (superAdmin) {
        NotificationService.create({
          recipient: superAdmin._id,
          type: "TICKET",
          title: "SLA Breach — Ticket Escalated",
          message: `Ticket #${ticket.ticketNumber} breached its resolution SLA. Priority escalated to ${ticket.priority}.`,
          meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber, priority: ticket.priority },
        }).catch(() => {});
      }

      // Notify ticket creator
      NotificationService.create({
        recipient: ticket.createdBy,
        type: "TICKET",
        title: "Ticket Escalated",
        message: `Your ticket #${ticket.ticketNumber} has been escalated due to SLA breach.`,
        meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[SLA] Resolution breach check error:", err.message);
  }
};

/**
 * Run all SLA checks in sequence
 */
const runSlaChecks = async () => {
  await checkFirstResponseBreaches();
  await checkResolutionWarnings();
  await checkResolutionBreaches();
};

/**
 * Start the SLA enforcer cron — runs every 5 minutes
 */
export const startSlaEnforcer = () => {
  cron.schedule("*/5 * * * *", runSlaChecks);
  console.log("[SLA] ✅ SLA enforcer scheduler started (every 5 min)");
};
