import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    // Who booked (logged-in user)
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Snapshot of patient details at booking time
    patientInfo: {
      name: { type: String, required: true, trim: true, maxlength: 100 },
      contact: { type: String, required: true, trim: true, maxlength: 30 }, // phone or email
      email: { type: String, trim: true, lowercase: true, maxlength: 120 }, // optional if contact = phone
      symptoms: { type: String, trim: true, maxlength: 1000 }, // notes/symptom
    },

    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },

    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    // Appointment time
    dateTime: {
      type: Date,
      required: true,
      index: true,
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
      index: true,
    },
  },
  { timestamps: true }
);

// Optional: prevent duplicate bookings for same doctor + same time
appointmentSchema.index({ doctorId: 1, dateTime: 1 }, { unique: true });

export default mongoose.model("Appointment", appointmentSchema);
