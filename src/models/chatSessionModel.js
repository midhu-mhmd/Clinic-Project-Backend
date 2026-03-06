import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["user", "assistant", "system"],
    required: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 10000,
  },
  timestamp: { type: Date, default: Date.now },
});

const chatSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "New Chat",
      trim: true,
      maxlength: 100,
    },
    messages: [chatMessageSchema],
    context: {
      symptoms: [String],
      severity: {
        type: String,
        enum: ["mild", "moderate", "severe", null],
        default: null,
      },
      detectedDepartment: { type: String, default: null },
      recommendedDoctorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Doctor" }],
      appointmentBooked: { type: Boolean, default: false },
      ticketCreated: { type: Boolean, default: false },
      isEmergency: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("ChatSession", chatSessionSchema);
