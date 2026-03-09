import express from "express";
import TicketController from "../controllers/ticketController.js";
import { protect, authorize } from "../middlewares/authMiddleware.js";

const ticketRouter = express.Router();

// All routes require auth
ticketRouter.use(protect);

// ─── User routes (Patient / Clinic Admin) ───
ticketRouter.post("/", TicketController.create);
ticketRouter.get("/", TicketController.getMyTickets);

// ─── Patient: clinics visited (for ticket clinic selector) ───
ticketRouter.get("/my-clinics", TicketController.getMyVisitedClinics);

// ─── Clinic Admin: tenant-routed tickets ───
ticketRouter.get("/tenant", authorize("CLINIC_ADMIN"), TicketController.getTenantTickets);
ticketRouter.get("/stats", authorize("SUPER_ADMIN", "CLINIC_ADMIN"), TicketController.getStats);

// ─── Super Admin: all tickets ───
ticketRouter.get("/all", authorize("SUPER_ADMIN"), TicketController.getAllTickets);

// ─── Single ticket (user sees own, admin sees all, clinic admin sees tenant-routed) ───
ticketRouter.get("/:id", TicketController.getById);
ticketRouter.post("/:id/reply", TicketController.reply);

// ─── Admin / Clinic Admin actions ───
ticketRouter.patch("/:id/status", authorize("SUPER_ADMIN", "CLINIC_ADMIN"), TicketController.updateStatus);
ticketRouter.patch("/:id/assign", authorize("SUPER_ADMIN"), TicketController.assign);

export default ticketRouter;
