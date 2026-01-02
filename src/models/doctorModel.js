import mongoose from "mongoose";

const doctorSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true
    },
    name: {
      type: String,
      required: true
    },
    specialization: {
      type: String,
      required: true
    },
    experience: Number,
    consultationFee: Number,
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("Doctor", doctorSchema);
