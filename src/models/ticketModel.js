import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  senderRole: {
    type: String,
    enum: ["PATIENT", "CLINIC_ADMIN", "SUPER_ADMIN"],
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000,
  },
  createdAt: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      unique: true,
      index: true,
    },
    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: 3000,
    },
    category: {
      type: String,
      enum: ["BILLING", "TECHNICAL", "APPOINTMENT", "ACCOUNT", "GENERAL", "FEEDBACK"],
      default: "GENERAL",
      index: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "AWAITING_REPLY", "RESOLVED", "CLOSED"],
      default: "OPEN",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    createdByRole: {
      type: String,
      enum: ["PATIENT", "CLINIC_ADMIN"],
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },

    // ── Routing ──
    routedTo: {
      type: String,
      enum: ["SUPER_ADMIN", "TENANT"],
      default: "SUPER_ADMIN",
      index: true,
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── SLA — First Response ──
    firstResponseDeadline: {
      type: Date,
      default: null,
      index: true,
    },
    firstRespondedAt: {
      type: Date,
      default: null,
    },
    firstResponseBreached: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ── SLA — Resolution ──
    slaDeadline: {
      type: Date,
      default: null,
      index: true,
    },
    slaBreached: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ── Escalation ──
    escalationLevel: {
      type: Number,
      default: 0, // 0 = none, 1 = warning sent, 2 = breached & escalated
    },
    escalatedAt: {
      type: Date,
      default: null,
    },

    // ── SLA Pause (while awaiting customer reply) ──
    slaPausedAt: {
      type: Date,
      default: null,
    },
    totalPausedMs: {
      type: Number,
      default: 0,
    },

    messages: [messageSchema],
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ticketSchema.pre("save", async function () {
  if (!this.ticketNumber) {
    const count = await mongoose.model("Ticket").countDocuments();
    this.ticketNumber = `TKT-${String(count + 1).padStart(5, "0")}`;
  }
});

export default mongoose.model("Ticket", ticketSchema);
