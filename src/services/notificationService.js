import Notification from "../models/notificationModel.js";
import mongoose from "mongoose";

class NotificationService {
  #isValidObjectId(id) {
    return Boolean(id) && mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Create a notification for a user
   */
  async create({ recipient, type, title, message, meta, link }) {
    if (!this.#isValidObjectId(recipient)) throw new Error("Invalid recipient.");
    if (!title?.trim()) throw new Error("Title is required.");
    if (!message?.trim()) throw new Error("Message is required.");

    return Notification.create({
      recipient,
      type: type || "SYSTEM",
      title: title.trim(),
      message: message.trim(),
      meta: meta || {},
      link: link || "",
    });
  }

  /**
   * Bulk create notifications for multiple recipients
   */
  async createBulk(recipients, { type, title, message, meta, link }) {
    const docs = recipients
      .filter((id) => this.#isValidObjectId(id))
      .map((recipient) => ({
        recipient,
        type: type || "SYSTEM",
        title: title.trim(),
        message: message.trim(),
        meta: meta || {},
        link: link || "",
      }));

    if (docs.length === 0) return [];
    return Notification.insertMany(docs);
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(userId, { page = 1, limit = 30, unreadOnly = false } = {}) {
    if (!this.#isValidObjectId(userId)) throw new Error("Invalid user.");

    const query = { recipient: userId };
    if (unreadOnly) query.isRead = false;

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ recipient: userId, isRead: false }),
    ]);

    return {
      notifications,
      total,
      unreadCount,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId, userId) {
    if (!this.#isValidObjectId(notificationId)) throw new Error("Invalid notification ID.");

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true },
      { new: true }
    ).lean();

    if (!notification) throw new Error("Notification not found.");
    return notification;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    if (!this.#isValidObjectId(userId)) throw new Error("Invalid user.");

    const result = await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true }
    );

    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId, userId) {
    if (!this.#isValidObjectId(notificationId)) throw new Error("Invalid notification ID.");

    const result = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId,
    });

    if (!result) throw new Error("Notification not found.");
    return { deleted: true };
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId) {
    if (!this.#isValidObjectId(userId)) throw new Error("Invalid user.");
    return Notification.countDocuments({ recipient: userId, isRead: false });
  }
}

export default new NotificationService();
