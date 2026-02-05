import mongoose from "mongoose";

const { Schema } = mongoose;

const PLANS = ["PRO", "ENTERPRISE", "PROFESSIONAL"];
const STATUSES = ["ACTIVE", "PAST_DUE", "CANCELED", "PENDING_VERIFICATION"];

const DOCTOR_LIMITS = {
  PRO: 3,
  ENTERPRISE: 5,
  PROFESSIONAL: Number.POSITIVE_INFINITY,
};

const tenantSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Clinic name is required"],
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    registrationId: {
      type: String,
      required: [true, "Medical Registration ID is required"],
      unique: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
      maxlength: 250,
    },
    image: {
      type: String,
      default: "https://images.unsplash.com/photo-1629909613654-2871b886daa4?q=80&w=800",
    },
    tags: {
      type: [String],
      default: ["General Practice", "Medical Excellence"],
      index: true,
    },
    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    settings: {
      themeColor: { type: String, default: "#8DAA9D" },
      isPublic: { type: Boolean, default: true, index: true },
    },
    subscription: {
      plan: {
        type: String,
        enum: PLANS,
        default: "PRO",
        required: true,
        index: true,
      },
      status: {
        type: String,
        enum: STATUSES,
        default: "PENDING_VERIFICATION",
        index: true,
      },
      // ✅ ADDED: Price tracking inside subscription
      price: {
        amount: { 
          type: Number, 
          default: 0, 
          required: [true, "Subscription price is required"] 
        },
        currency: { 
          type: String, 
          default: "INR", 
          uppercase: true 
        },
      },
      razorpayOrderId: { type: String, index: true },
      razorpayPaymentId: { type: String, index: true },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* =========================================================
   VIRTUALS
========================================================= */

tenantSchema.virtual("subscriptionPlan").get(function () {
  return this.subscription?.plan;
});

tenantSchema.virtual("doctorLimit").get(function () {
  const plan = String(this.subscription?.plan || "").toUpperCase();
  return DOCTOR_LIMITS[plan] ?? 0;
});

tenantSchema.virtual("isSubscriptionActive").get(function () {
  return String(this.subscription?.status || "").toUpperCase() === "ACTIVE";
});

// ✅ ADDED: Formatted price virtual (e.g., "₹499")
tenantSchema.virtual("formattedSubscriptionPrice").get(function () {
  if (!this.subscription?.price) return null;
  const { amount, currency } = this.subscription.price;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
});

/* =========================================================
   INDEXES
========================================================= */
tenantSchema.index({ "settings.isPublic": 1, createdAt: -1 });
tenantSchema.index({ name: 1 });

/* =========================================================
   SLUG GENERATION
========================================================= */
const slugify = (value = "") =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

tenantSchema.pre("validate", function () {
  if (this.name && !this.slug) {
    this.slug = `${slugify(this.name)}-${Date.now().toString(36)}`;
  }
});

const Tenant = mongoose.model("Tenant", tenantSchema);
export default Tenant;