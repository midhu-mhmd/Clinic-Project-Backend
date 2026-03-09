import Ticket from "../models/ticketModel.js";
import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import mongoose from "mongoose";

// ── Category → routing target ──
const CATEGORY_ROUTING = {
  TECHNICAL: "SUPER_ADMIN",
  ACCOUNT: "SUPER_ADMIN",
  BILLING: "TENANT",
  APPOINTMENT: "TENANT",
  FEEDBACK: "TENANT",
  GENERAL: "TENANT",
};

// ── Category → default priority ──
const CATEGORY_PRIORITY = {
  TECHNICAL: "HIGH",
  ACCOUNT: "HIGH",
  BILLING: "MEDIUM",
  APPOINTMENT: "MEDIUM",
  GENERAL: "LOW",
  FEEDBACK: "LOW",
};

// ── SLA Configuration (hours) ──
export const SLA_CONFIG = {
  URGENT: { firstResponse: 0.5, resolution: 2 },
  HIGH:   { firstResponse: 1,   resolution: 4 },
  MEDIUM: { firstResponse: 2,   resolution: 8 },
  LOW:    { firstResponse: 4,   resolution: 24 },
};

class TicketService {
  #isValidObjectId(id) {
    return Boolean(id) && mongoose.Types.ObjectId.isValid(id);
  }

  #calcDeadlines(priority) {
    const cfg = SLA_CONFIG[priority] || SLA_CONFIG.MEDIUM;
    const now = Date.now();
    return {
      firstResponseDeadline: new Date(now + cfg.firstResponse * 60 * 60 * 1000),
      slaDeadline: new Date(now + cfg.resolution * 60 * 60 * 1000),
    };
  }

  async #resolveAssignee(routedTo, tenantId) {
    if (routedTo === "TENANT" && tenantId) {
      const tenant = await Tenant.findById(tenantId).select("ownerId").lean();
      if (tenant?.ownerId) return tenant.ownerId;
    }
    // Fallback: assign to a super admin
    const admin = await User.findOne({ role: "SUPER_ADMIN" }).select("_id").lean();
    return admin?._id || null;
  }

  /**
   * Create a new support ticket with auto-routing, auto-priority, and SLA
   */
  async createTicket({ userId, role, tenantId, subject, description, category }) {
    if (!this.#isValidObjectId(userId)) throw new Error("Invalid user.");
    if (!subject?.trim()) throw new Error("Subject is required.");
    if (!description?.trim()) throw new Error("Description is required.");

    const normalizedCategory = (category || "GENERAL").toUpperCase();

    // Auto-priority from category
    const priority = CATEGORY_PRIORITY[normalizedCategory] || "MEDIUM";

    // Auto-routing: tickets with a tenantId go to the clinic, otherwise super admin
    let routedTo;
    if (tenantId) {
      routedTo = "TENANT";
    } else {
      routedTo = "SUPER_ADMIN";
    }

    const assignedTo = await this.#resolveAssignee(routedTo, tenantId);
    const { firstResponseDeadline, slaDeadline } = this.#calcDeadlines(priority);

    const ticket = await Ticket.create({
      subject: subject.trim(),
      description: description.trim(),
      category: normalizedCategory,
      priority,
      createdBy: userId,
      createdByRole: role,
      tenantId: tenantId || null,
      routedTo,
      assignedTo,
      firstResponseDeadline,
      slaDeadline,
    });

    return ticket;
  }

  /**
   * List tickets for a specific user (patient or clinic admin)
   */
  async getUserTickets(userId, { status, page = 1, limit = 20 } = {}) {
    if (!this.#isValidObjectId(userId)) throw new Error("Invalid user.");

    const query = { createdBy: userId };
    if (status) query.status = status.toUpperCase();

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("-messages")
        .lean(),
      Ticket.countDocuments(query),
    ]);

    return { tickets, total, page: Number(page), totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get all tickets (super admin) — supports routedTo filter
   */
  async getAllTickets({ status, category, priority, routedTo, page = 1, limit = 20 } = {}) {
    const query = {};
    if (status) query.status = status.toUpperCase();
    if (category) query.category = category.toUpperCase();
    if (priority) query.priority = priority.toUpperCase();
    if (routedTo) query.routedTo = routedTo.toUpperCase();

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate("createdBy", "name email image")
        .populate("tenantId", "name")
        .populate("assignedTo", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("-messages")
        .lean(),
      Ticket.countDocuments(query),
    ]);

    return { tickets, total, page: Number(page), totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get single ticket by ID with messages
   */
  async getTicketById(ticketId, userId, role, tenantId) {
    if (!this.#isValidObjectId(ticketId)) throw new Error("Invalid ticket ID.");

    const ticket = await Ticket.findById(ticketId)
      .populate("createdBy", "name email image role")
      .populate("tenantId", "name")
      .populate("assignedTo", "name email image")
      .populate("messages.sender", "name image role")
      .lean();

    if (!ticket) throw new Error("Ticket not found.");

    const isOwner = String(ticket.createdBy._id) === String(userId);
    const isSuperAdmin = role === "SUPER_ADMIN";
    // Clinic admins can view tickets routed to their tenant
    const isTenantHandler =
      role === "CLINIC_ADMIN" &&
      ticket.routedTo === "TENANT" &&
      tenantId &&
      String(ticket.tenantId?._id || ticket.tenantId) === String(tenantId);

    if (!isOwner && !isSuperAdmin && !isTenantHandler) {
      throw new Error("Access denied.");
    }

    return ticket;
  }

  /**
   * Get tickets routed to a tenant (for clinic admin dashboard)
   */
  async getTenantTickets(tenantId, { status, priority, page = 1, limit = 20 } = {}) {
    if (!this.#isValidObjectId(tenantId)) throw new Error("Invalid tenant.");

    const query = { tenantId, routedTo: "TENANT" };
    if (status) query.status = status.toUpperCase();
    if (priority) query.priority = priority.toUpperCase();

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate("createdBy", "name email image")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("-messages")
        .lean(),
      Ticket.countDocuments(query),
    ]);

    return { tickets, total, page: Number(page), totalPages: Math.ceil(total / limit) };
  }

  /**
   * Add a reply message to a ticket
   */
  async addReply(ticketId, userId, role, content, tenantId) {
    if (!this.#isValidObjectId(ticketId)) throw new Error("Invalid ticket ID.");
    if (!content?.trim()) throw new Error("Reply content is required.");

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) throw new Error("Ticket not found.");

    const isOwner = String(ticket.createdBy) === String(userId);
    const isSuperAdmin = role === "SUPER_ADMIN";
    const isTenantHandler =
      role === "CLINIC_ADMIN" &&
      ticket.routedTo === "TENANT" &&
      tenantId &&
      String(ticket.tenantId) === String(tenantId);

    if (!isOwner && !isSuperAdmin && !isTenantHandler) {
      throw new Error("Access denied.");
    }

    ticket.messages.push({
      sender: userId,
      senderRole: role,
      content: content.trim(),
    });

    // ── First response tracking (staff reply) ──
    const isStaffReply = role === "SUPER_ADMIN" || isTenantHandler;
    if (isStaffReply && !ticket.firstRespondedAt) {
      ticket.firstRespondedAt = new Date();
      if (ticket.firstResponseDeadline && new Date() > ticket.firstResponseDeadline) {
        ticket.firstResponseBreached = true;
      }
    }

    // Update status based on who replied
    if (isStaffReply) {
      // Resume SLA if it was paused (customer had replied, now staff responds)
      if (ticket.slaPausedAt) {
        const pausedMs = Date.now() - ticket.slaPausedAt.getTime();
        ticket.totalPausedMs += pausedMs;
        // Shift deadline forward by paused duration
        if (ticket.slaDeadline && !ticket.slaBreached) {
          ticket.slaDeadline = new Date(ticket.slaDeadline.getTime() + pausedMs);
        }
        ticket.slaPausedAt = null;
      }
      ticket.status = "AWAITING_REPLY";
      // Pause SLA — clock stops while waiting for customer
      ticket.slaPausedAt = new Date();
    } else if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
      ticket.status = "OPEN"; // Re-open if user replies to resolved ticket
    } else {
      // Customer replied — resume SLA if paused
      if (ticket.slaPausedAt) {
        const pausedMs = Date.now() - ticket.slaPausedAt.getTime();
        ticket.totalPausedMs += pausedMs;
        ticket.slaPausedAt = null;
        // Shift slaDeadline forward by the paused duration
        if (ticket.slaDeadline && !ticket.slaBreached) {
          ticket.slaDeadline = new Date(ticket.slaDeadline.getTime() + pausedMs);
        }
      }
    }

    await ticket.save();
    return ticket;
  }

  /**
   * Update ticket status (admin or tenant handler)
   */
  async updateTicketStatus(ticketId, status, role, tenantId) {
    if (!this.#isValidObjectId(ticketId)) throw new Error("Invalid ticket ID.");

    const validStatuses = ["OPEN", "IN_PROGRESS", "AWAITING_REPLY", "RESOLVED", "CLOSED"];
    const normalized = String(status).toUpperCase();
    if (!validStatuses.includes(normalized)) throw new Error("Invalid status.");

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) throw new Error("Ticket not found.");

    // CLINIC_ADMIN can only update tickets routed to their tenant
    if (role === "CLINIC_ADMIN") {
      if (ticket.routedTo !== "TENANT" || String(ticket.tenantId) !== String(tenantId)) {
        throw new Error("Access denied.");
      }
    }

    ticket.status = normalized;
    if (normalized === "RESOLVED") ticket.resolvedAt = new Date();
    if (normalized === "CLOSED") ticket.closedAt = new Date();

    // SLA pause/resume on status change
    if (normalized === "AWAITING_REPLY" && !ticket.slaPausedAt) {
      ticket.slaPausedAt = new Date();
    } else if (normalized !== "AWAITING_REPLY" && ticket.slaPausedAt) {
      const pausedMs = Date.now() - ticket.slaPausedAt.getTime();
      ticket.totalPausedMs += pausedMs;
      ticket.slaPausedAt = null;
      if (ticket.slaDeadline && !ticket.slaBreached) {
        ticket.slaDeadline = new Date(ticket.slaDeadline.getTime() + pausedMs);
      }
      if (ticket.firstResponseDeadline && !ticket.firstRespondedAt) {
        ticket.firstResponseDeadline = new Date(ticket.firstResponseDeadline.getTime() + pausedMs);
      }
    }

    await ticket.save();
    return ticket.toObject();
  }

  /**
   * Assign ticket to an admin user
   */
  async assignTicket(ticketId, assigneeId) {
    if (!this.#isValidObjectId(ticketId)) throw new Error("Invalid ticket ID.");
    if (!this.#isValidObjectId(assigneeId)) throw new Error("Invalid assignee ID.");

    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      { assignedTo: assigneeId, status: "IN_PROGRESS" },
      { new: true }
    ).lean();

    if (!ticket) throw new Error("Ticket not found.");
    return ticket;
  }

  /**
   * Get ticket stats (admin dashboard)
   */
  async getTicketStats(tenantId) {
    const matchStage = tenantId
      ? { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), routedTo: "TENANT" } }
      : { $match: {} };

    const [statusCounts, categoryCounts, priorityCounts, slaCounts, firstResponseCounts, avgTimes] = await Promise.all([
      Ticket.aggregate([matchStage, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Ticket.aggregate([matchStage, { $group: { _id: "$category", count: { $sum: 1 } } }]),
      Ticket.aggregate([matchStage, { $group: { _id: "$priority", count: { $sum: 1 } } }]),
      Ticket.aggregate([matchStage, { $group: { _id: "$slaBreached", count: { $sum: 1 } } }]),
      Ticket.aggregate([matchStage, { $group: { _id: "$firstResponseBreached", count: { $sum: 1 } } }]),
      Ticket.aggregate([
        matchStage,
        { $match: { firstRespondedAt: { $ne: null } } },
        {
          $group: {
            _id: null,
            avgFirstResponseMs: {
              $avg: { $subtract: ["$firstRespondedAt", "$createdAt"] },
            },
            avgResolutionMs: {
              $avg: {
                $cond: [
                  { $ne: ["$resolvedAt", null] },
                  { $subtract: ["$resolvedAt", "$createdAt"] },
                  null,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const toMap = (arr) => arr.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {});
    const avg = avgTimes[0] || {};
    return {
      byStatus: toMap(statusCounts),
      byCategory: toMap(categoryCounts),
      byPriority: toMap(priorityCounts),
      sla: toMap(slaCounts),
      firstResponse: toMap(firstResponseCounts),
      avgFirstResponseMin: avg.avgFirstResponseMs ? Math.round(avg.avgFirstResponseMs / 60000) : null,
      avgResolutionMin: avg.avgResolutionMs ? Math.round(avg.avgResolutionMs / 60000) : null,
      total: statusCounts.reduce((s, x) => s + x.count, 0),
    };
  }
}

export default new TicketService();
