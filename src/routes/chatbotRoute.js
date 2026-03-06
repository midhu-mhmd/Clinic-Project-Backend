import express from "express";
import ChatbotController from "../controllers/chatbotController.js";
import { protect } from "../middlewares/authMiddleware.js";

const chatbotRouter = express.Router();

// All routes require auth
chatbotRouter.use(protect);

// ─── Sessions ───
chatbotRouter.post("/sessions", ChatbotController.createSession);
chatbotRouter.get("/sessions", ChatbotController.getSessions);

// ─── Single session ───
chatbotRouter.get("/sessions/:id", ChatbotController.getSession);
chatbotRouter.post("/sessions/:id/message", ChatbotController.sendMessage);
chatbotRouter.delete("/sessions/:id", ChatbotController.deleteSession);

export default chatbotRouter;
