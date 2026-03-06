import Ticket from "../models/ticketModel.js";
import mongoose from "mongoose";

class TicketService {
  #isValidObjectId(id) {
    return Boolean(id) && mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Create a new support ticket
   */
  async createTicket({ userId, role, tenantId, subject, description, category, priority }) {
    if (!this.#isValidObjectId(userId)) throw new Error("Invalid user.");
    if (!subject?.trim()) throw new Error("Subject is required.");
    if (!description?.trim()) throw new Error("Description is required.");

    const ticket = await Ticket.create({
      subject: subject.trim(),
      description: description.trim(),
      category: category || "GENERAL",
      priority: priority || "MEDIUM",
      createdBy: userId,
      createdByRole: role,
      tenantId: tenantId || null,
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
   * Get all tickets (super admin)
   */
  async getAllTickets({ status, category, priority, page = 1, limit = 20 } = {}) {
    const query = {};
    if (status) query.status = status.toUpperCase();
    if (category) query.category = category.toUpperCase();
    if (priority) query.priority = priority.toUpperCase();

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate("createdBy", "name email image")
        .populate("tenantId", "name")
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
  async getTicketById(ticketId, userId, role) {
    if (!this.#isValidObjectId(ticketId)) throw new Error("Invalid ticket ID.");

    const ticket = await Ticket.findById(ticketId)
      .populate("createdBy", "name email image role")
      .populate("tenantId", "name")
      .populate("messages.sender", "name image role")
      .lean();

    if (!ticket) throw new Error("Ticket not found.");

    // Non-admins can only see their own tickets
    if (role !== "SUPER_ADMIN" && String(ticket.createdBy._id) !== String(userId)) {
      throw new Error("Access denied.");
    }

    return ticket;
  }

  /**
   * Add a reply message to a ticket
   */
  async addReply(ticketId, userId, role, content) {
    if (!this.#isValidObjectId(ticketId)) throw new Error("Invalid ticket ID.");
    if (!content?.trim()) throw new Error("Reply content is required.");

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) throw new Error("Ticket not found.");

    // Verify access
    if (role !== "SUPER_ADMIN" && String(ticket.createdBy) !== String(userId)) {
      throw new Error("Access denied.");
    }

    ticket.messages.push({
      sender: userId,
      senderRole: role,
      content: content.trim(),
    });

    // Update status based on who replied
    if (role === "SUPER_ADMIN") {
      ticket.status = "AWAITING_REPLY";
    } else if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
      ticket.status = "OPEN"; // Re-open if user replies to resolved ticket
    }

    await ticket.save();
    return ticket;
  }

  /**
   * Update ticket status (admin)
   */
  async updateTicketStatus(ticketId, status) {
    if (!this.#isValidObjectId(ticketId)) throw new Error("Invalid ticket ID.");

    const validStatuses = ["OPEN", "IN_PROGRESS", "AWAITING_REPLY", "RESOLVED", "CLOSED"];
    const normalized = String(status).toUpperCase();
    if (!validStatuses.includes(normalized)) throw new Error("Invalid status.");

    const update = { status: normalized };
    if (normalized === "RESOLVED") update.resolvedAt = new Date();
    if (normalized === "CLOSED") update.closedAt = new Date();

    const ticket = await Ticket.findByIdAndUpdate(ticketId, update, { new: true }).lean();
    if (!ticket) throw new Error("Ticket not found.");
    return ticket;
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
  async getTicketStats() {
    const [statusCounts, categoryCounts, priorityCounts] = await Promise.all([
      Ticket.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Ticket.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
      Ticket.aggregate([{ $group: { _id: "$priority", count: { $sum: 1 } } }]),
    ]);

    const toMap = (arr) => arr.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {});
    return {
      byStatus: toMap(statusCounts),
      byCategory: toMap(categoryCounts),
      byPriority: toMap(priorityCounts),
      total: statusCounts.reduce((s, x) => s + x.count, 0),
    };
  }
}

export default new TicketService();
