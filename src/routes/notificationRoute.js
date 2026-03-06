import express from "express";
import NotificationController from "../controllers/notificationController.js";
import { protect } from "../middlewares/authMiddleware.js";

const notificationRouter = express.Router();

// All routes require auth
notificationRouter.use(protect);

// Static routes first
notificationRouter.get("/unread-count", NotificationController.getUnreadCount);
notificationRouter.patch("/read-all", NotificationController.markAllAsRead);

// Collection
notificationRouter.get("/", NotificationController.getMyNotifications);

// Dynamic ID routes
notificationRouter.patch("/:id/read", NotificationController.markAsRead);
notificationRouter.delete("/:id", NotificationController.deleteNotification);

export default notificationRouter;
