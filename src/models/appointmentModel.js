import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    dateTime: {
      type: Date,
      required: true,
    },
    consultationFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Appointment", appointmentSchema);