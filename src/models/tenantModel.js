import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Clinic name is required"],
      trim: true,
    },
    registrationId: {
      type: String,
      required: [true, "Medical Registration ID is required"],
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    address: {
      type: String,
      required: [true, "Address is required"],
    },
    settings: {
      themeColor: { type: String, default: "#8DAA9D" },
      isPublic: { type: Boolean, default: true },
    },
    subscription: {
      plan: { type: String, enum: ["FREE", "PRO", "ENTERPRISE"], default: "FREE" },
      status: { type: String, enum: ["ACTIVE", "PAST_DUE", "CANCELED"], default: "ACTIVE" },
    },
  },
  { timestamps: true }
);

// ✅ Synchronous pre-validate hook (no next)
tenantSchema.pre("validate", function () {
  if (this.name && !this.slug) {
    this.slug = this.name.toLowerCase().split(" ").join("-") + "-" + Date.now();
  }
});

const Tenant = mongoose.model("Tenant", tenantSchema);
export default Tenant;
