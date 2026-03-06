import NotificationService from "../services/notificationService.js";

const resolveUserId = (req) => req.user?._id || req.user?.id || null;

class NotificationController {
  /**
   * GET /api/notifications — Get current user's notifications
   */
  getMyNotifications = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const { page, limit, unreadOnly } = req.query;

      const result = await NotificationService.getUserNotifications(userId, {
        page,
        limit,
        unreadOnly: unreadOnly === "true",
      });

      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch notifications.",
      });
    }
  };

  /**
   * GET /api/notifications/unread-count — Quick unread count
   */
  getUnreadCount = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const count = await NotificationService.getUnreadCount(userId);

      return res.status(200).json({ success: true, unreadCount: count });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch count.",
      });
    }
  };

  /**
   * PATCH /api/notifications/:id/read — Mark one as read
   */
  markAsRead = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const notification = await NotificationService.markAsRead(req.params.id, userId);

      return res.status(200).json({ success: true, data: notification });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to mark as read.",
      });
    }
  };

  /**
   * PATCH /api/notifications/read-all — Mark all as read
   */
  markAllAsRead = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const result = await NotificationService.markAllAsRead(userId);

      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to mark all as read.",
      });
    }
  };

  /**
   * DELETE /api/notifications/:id — Delete a notification
   */
  deleteNotification = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      await NotificationService.deleteNotification(req.params.id, userId);

      return res.status(200).json({ success: true, message: "Notification deleted." });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to delete notification.",
      });
    }
  };
}

export default new NotificationController();
