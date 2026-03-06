import express from "express";
import TicketController from "../controllers/ticketController.js";
import { protect, authorize } from "../middlewares/authMiddleware.js";

const ticketRouter = express.Router();

// All routes require auth
ticketRouter.use(protect);

// ─── User routes (Patient / Clinic Admin) ───
ticketRouter.post("/", TicketController.create);
ticketRouter.get("/", TicketController.getMyTickets);

// ─── Admin-only routes ───
ticketRouter.get("/all", authorize("SUPER_ADMIN"), TicketController.getAllTickets);
ticketRouter.get("/stats", authorize("SUPER_ADMIN"), TicketController.getStats);

// ─── Single ticket (user sees own, admin sees all) ───
ticketRouter.get("/:id", TicketController.getById);
ticketRouter.post("/:id/reply", TicketController.reply);

// ─── Admin actions ───
ticketRouter.patch("/:id/status", authorize("SUPER_ADMIN"), TicketController.updateStatus);
ticketRouter.patch("/:id/assign", authorize("SUPER_ADMIN"), TicketController.assign);

export default ticketRouter;
