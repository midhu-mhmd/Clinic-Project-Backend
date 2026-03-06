import mongoose from "mongoose";

const videoConsultationSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      index: true,
    },
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["WAITING", "IN_PROGRESS", "COMPLETED", "MISSED", "CANCELLED"],
      default: "WAITING",
      index: true,
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 }, // seconds
    doctorNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    prescription: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    doctorJoinedAt: { type: Date, default: null },
    patientJoinedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("VideoConsultation", videoConsultationSchema);
