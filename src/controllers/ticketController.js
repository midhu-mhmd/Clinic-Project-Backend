import TicketService from "../services/ticketService.js";
import NotificationService from "../services/notificationService.js";
import Appointment from "../models/appointmentModel.js";
import Tenant from "../models/tenantModel.js";

const resolveUserId = (req) => req.user?._id || req.user?.id || null;
const resolveRole = (req) => String(req.user?.role || "").toUpperCase();
const resolveTenantId = (req) => req.user?.tenantId || null;

class TicketController {
  /**
   * POST /api/tickets — Create a new ticket
   */
  create = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const role = resolveRole(req);
      const tenantId = resolveTenantId(req) || req.body?.tenantId || null;
      const { subject, description, category } = req.body;

      const ticket = await TicketService.createTicket({
        userId,
        role,
        tenantId,
        subject,
        description,
        category,
      });

      // Notify the ticket creator
      NotificationService.create({
        recipient: userId,
        type: "TICKET",
        title: "Ticket Created",
        message: `Your ticket #${ticket.ticketNumber} has been submitted successfully.`,
        meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
      }).catch(() => {});

      // Notify the assignee
      if (ticket.assignedTo && String(ticket.assignedTo) !== String(userId)) {
        NotificationService.create({
          recipient: ticket.assignedTo,
          type: "TICKET",
          title: "New Ticket Assigned",
          message: `Ticket #${ticket.ticketNumber} (${ticket.category}) has been assigned to you. Priority: ${ticket.priority}`,
          meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber, priority: ticket.priority },
        }).catch(() => {});
      }

      return res.status(201).json({
        success: true,
        message: "Ticket created successfully.",
        data: ticket,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to create ticket.",
      });
    }
  };

  /**
   * GET /api/tickets — List user's own tickets
   */
  getMyTickets = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const { status, page, limit } = req.query;

      const result = await TicketService.getUserTickets(userId, { status, page, limit });

      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch tickets.",
      });
    }
  };

  /**
   * GET /api/tickets/all — Admin: list all tickets
   */
  getAllTickets = async (req, res) => {
    try {
      const { status, category, priority, routedTo, page, limit } = req.query;
      const result = await TicketService.getAllTickets({ status, category, priority, routedTo, page, limit });

      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch tickets.",
      });
    }
  };

  /**
   * GET /api/tickets/tenant — Clinic Admin: list tickets routed to their tenant
   */
  getTenantTickets = async (req, res) => {
    try {
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, message: "No tenant associated." });
      }

      const { status, priority, page, limit } = req.query;
      const result = await TicketService.getTenantTickets(tenantId, { status, priority, page, limit });

      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch tenant tickets.",
      });
    }
  };

  /**
   * GET /api/tickets/stats — Admin / Clinic Admin: ticket statistics
   */
  getStats = async (req, res) => {
    try {
      const role = resolveRole(req);
      const tenantId = role === "CLINIC_ADMIN" ? resolveTenantId(req) : null;
      const stats = await TicketService.getTicketStats(tenantId);
      return res.status(200).json({ success: true, data: stats });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch stats.",
      });
    }
  };

  /**
   * GET /api/tickets/:id — Get single ticket with messages
   */
  getById = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const role = resolveRole(req);
      const tenantId = resolveTenantId(req);
      const ticket = await TicketService.getTicketById(req.params.id, userId, role, tenantId);

      return res.status(200).json({ success: true, data: ticket });
    } catch (error) {
      const status = error.message === "Access denied." ? 403 : 400;
      return res.status(status).json({
        success: false,
        message: error?.message || "Failed to fetch ticket.",
      });
    }
  };

  /**
   * POST /api/tickets/:id/reply — Add a reply to a ticket
   */
  reply = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const role = resolveRole(req);
      const tenantId = resolveTenantId(req);
      const { content } = req.body;

      const ticket = await TicketService.addReply(req.params.id, userId, role, content, tenantId);

      // Notify the ticket creator when an admin/tenant replies
      if (role !== String(ticket.createdByRole) || String(ticket.createdBy) !== String(userId)) {
        NotificationService.create({
          recipient: ticket.createdBy,
          type: "TICKET",
          title: "New Reply on Your Ticket",
          message: `Your ticket #${ticket.ticketNumber} has a new reply.`,
          meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
        }).catch(() => {});
      }

      // If the ticket creator replies, notify the assignee
      if (String(ticket.createdBy) === String(userId) && ticket.assignedTo) {
        NotificationService.create({
          recipient: ticket.assignedTo,
          type: "TICKET",
          title: "Ticket Reply",
          message: `New reply on ticket #${ticket.ticketNumber}.`,
          meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
        }).catch(() => {});
      }

      return res.status(200).json({
        success: true,
        message: "Reply added.",
        data: ticket,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to add reply.",
      });
    }
  };

  /**
   * PATCH /api/tickets/:id/status — Admin / Clinic Admin: update ticket status
   */
  updateStatus = async (req, res) => {
    try {
      const role = resolveRole(req);
      const tenantId = resolveTenantId(req);
      const { status } = req.body;
      const ticket = await TicketService.updateTicketStatus(req.params.id, status, role, tenantId);

      // Notify ticket creator
      NotificationService.create({
        recipient: ticket.createdBy,
        type: "TICKET",
        title: "Ticket Updated",
        message: `Your ticket #${ticket.ticketNumber} has been marked as ${status}.`,
        meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber, status },
      }).catch(() => {});

      return res.status(200).json({
        success: true,
        message: "Status updated.",
        data: ticket,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to update status.",
      });
    }
  };

  /**
   * GET /api/tickets/my-clinics — Patient: get clinics visited (for ticket clinic selector)
   */
  getMyVisitedClinics = async (req, res) => {
    try {
      const userId = resolveUserId(req);

      const tenantIds = await Appointment.distinct("tenantId", { patientId: userId });

      const clinics = await Tenant.find({ _id: { $in: tenantIds } })
        .select("name slug")
        .lean();

      return res.status(200).json({ success: true, clinics });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch visited clinics.",
      });
    }
  };

  /**
   * PATCH /api/tickets/:id/assign — Admin: assign ticket
   */
  assign = async (req, res) => {
    try {
      const { assigneeId } = req.body;
      const ticket = await TicketService.assignTicket(req.params.id, assigneeId);

      // Notify the new assignee
      if (assigneeId) {
        NotificationService.create({
          recipient: assigneeId,
          type: "TICKET",
          title: "Ticket Assigned to You",
          message: `Ticket #${ticket.ticketNumber} has been assigned to you.`,
          meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
        }).catch(() => {});
      }

      return res.status(200).json({
        success: true,
        message: "Ticket assigned.",
        data: ticket,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to assign ticket.",
      });
    }
  };
}

export default new TicketController();
