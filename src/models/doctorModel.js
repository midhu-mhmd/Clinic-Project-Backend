import mongoose from "mongoose";

const doctorSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true },
  specialization: { type: String, required: true },
  education: { type: String, default: "Medical Degree" },
  experience: { type: Number, default: 0 },
  status: { type: String, enum: ["On Duty", "On Break", "Off Duty"], default: "On Duty" },
  availability: { type: String, default: "09:00 AM - 05:00 PM" },
  image: { type: String, default: "" },
  isActive: { type: Boolean, default: true },
  // Soft Delete Fields
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

// Global Query Middleware: Automatically exclude deleted records
doctorSchema.pre(/^find/, function () {
  this.find({ isDeleted: { $ne: true } });
});

export default mongoose.model("Doctor", doctorSchema);