import TicketService from "../services/ticketService.js";
import NotificationService from "../services/notificationService.js";

const resolveUserId = (req) => req.user?._id || req.user?.id || null;
const resolveRole = (req) => String(req.user?.role || "").toUpperCase();

class TicketController {
  /**
   * POST /api/tickets — Create a new ticket
   */
  create = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const role = resolveRole(req);
      const tenantId = req.user?.tenantId || req.body?.tenantId || null;
      const { subject, description, category, priority } = req.body;

      const ticket = await TicketService.createTicket({
        userId,
        role,
        tenantId,
        subject,
        description,
        category,
        priority,
      });

      // Send notification to super admins (fire-and-forget)
      NotificationService.create({
        recipient: userId,
        type: "TICKET",
        title: "Ticket Created",
        message: `Your ticket #${ticket.ticketNumber} has been submitted successfully.`,
        meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
      }).catch(() => {});

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
      const { status, category, priority, page, limit } = req.query;
      const result = await TicketService.getAllTickets({ status, category, priority, page, limit });

      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch tickets.",
      });
    }
  };

  /**
   * GET /api/tickets/stats — Admin: ticket statistics
   */
  getStats = async (req, res) => {
    try {
      const stats = await TicketService.getTicketStats();
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
      const ticket = await TicketService.getTicketById(req.params.id, userId, role);

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
      const { content } = req.body;

      const ticket = await TicketService.addReply(req.params.id, userId, role, content);

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
   * PATCH /api/tickets/:id/status — Admin: update ticket status
   */
  updateStatus = async (req, res) => {
    try {
      const { status } = req.body;
      const ticket = await TicketService.updateTicketStatus(req.params.id, status);

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
   * PATCH /api/tickets/:id/assign — Admin: assign ticket
   */
  assign = async (req, res) => {
    try {
      const { assigneeId } = req.body;
      const ticket = await TicketService.assignTicket(req.params.id, assigneeId);

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
