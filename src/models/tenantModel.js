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
      index: true,
    },
    address: {
      type: String,
      required: [true, "Address is required"],
    },
    image: {
      type: String,
      default:
        "https://images.unsplash.com/photo-1629909613654-2871b886daa4?q=80&w=800",
    },
    tags: {
      type: [String],
      default: ["General Practice", "Medical Excellence"],
    },
    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    settings: {
      themeColor: { type: String, default: "#8DAA9D" },
      isPublic: { type: Boolean, default: true },
    },
    subscription: {
      plan: {
        type: String,
        enum: ["FREE", "PRO", "ENTERPRISE", "Professional"],
        default: "FREE",
      },
      status: {
        type: String,
        enum: ["ACTIVE", "PAST_DUE", "CANCELED", "PENDING_VERIFICATION"],
        default: "ACTIVE",
      },
      razorpayOrderId: String,
      razorpayPaymentId: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

tenantSchema.virtual("subscriptionPlan").get(function () {
  return this.subscription?.plan;
});

tenantSchema.pre("validate", function () {
  if (this.name && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .concat("-")
      .concat(Date.now());
  }
});

const Tenant = mongoose.model("Tenant", tenantSchema);
export default Tenant;
