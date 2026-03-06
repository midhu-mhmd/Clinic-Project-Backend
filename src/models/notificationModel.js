import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["APPOINTMENT", "TICKET", "SYSTEM", "BILLING", "REMINDER", "CHAT"],
      default: "SYSTEM",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    link: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Auto-expire after 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model("Notification", notificationSchema);
