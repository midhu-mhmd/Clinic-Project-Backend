import mongoose from "mongoose";

const { Schema } = mongoose;

const PLANS = ["FREE", "PRO", "ENTERPRISE", "PROFESSIONAL"];
const STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INCOMPLETE", "PENDING_VERIFICATION"];

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
      branding: {
        primaryColor: { type: String, default: "#000000" },
        accentColor: { type: String, default: "#8DAA9D" },
        bannerImage: { type: String, default: "" },
        fontPreference: { type: String, enum: ["Serif", "Sans-Serif"], default: "Serif" },
      },
      notifications: {
        patientBookings: { email: { type: Boolean, default: true }, push: { type: Boolean, default: true } },
        appointmentReminders: { email: { type: Boolean, default: true }, push: { type: Boolean, default: false } },
        billingAlerts: { email: { type: Boolean, default: true }, push: { type: Boolean, default: true } },
        securityLogs: { email: { type: Boolean, default: true }, push: { type: Boolean, default: true } },
        marketingUpdates: { email: { type: Boolean, default: false }, push: { type: Boolean, default: false } },
      },
      globalMute: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true, index: true },
    subscription: {
      plan: {
        type: String,
        enum: PLANS,
        default: "FREE",
        required: true,
        index: true,
      },
      status: {
        type: String,
        enum: STATUSES,
        default: "PENDING_VERIFICATION",
        index: true,
      },
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
      billingCycle: {
        type: String,
        enum: ["MONTHLY", "ANNUAL"],
        default: "MONTHLY",
        index: true,
      },
      nextRenewalDate: {
        type: Date,
        index: true,
      },
      paymentMethodStatus: {
        type: String,
        enum: ["ON_FILE", "MISSING"],
        default: "MISSING",
        index: true,
      },
      cancelAtPeriodEnd: {
        type: Boolean,
        default: false,
      },
      isPaused: {
        type: Boolean,
        default: false,
      },
      auditLogs: [{
        action: String,
        performedBy: { type: Schema.Types.ObjectId, ref: "User" },
        details: String,
        timestamp: { type: Date, default: Date.now }
      }]
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
  const DOCTOR_LIMITS = { FREE: 1, PRO: 3, ENTERPRISE: 5, PROFESSIONAL: Number.POSITIVE_INFINITY };
  const plan = String(this.subscription?.plan || "").toUpperCase();
  return DOCTOR_LIMITS[plan] ?? 0;
});

tenantSchema.virtual("isSubscriptionActive").get(function () {
  return String(this.subscription?.status || "").toUpperCase() === "ACTIVE";
});

/**
 * ✅ FIXED: Added defensive logic to prevent "Currency code is required" crash.
 * Defaults to INR if currency is missing in DB.
 */
tenantSchema.virtual("formattedSubscriptionPrice").get(function () {
  if (!this.subscription?.price) return null;

  const amount = this.subscription.price.amount ?? 0;
  const currencyCode = this.subscription.price.currency || "INR";

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch (err) {
    // If the currency code is still invalid somehow, return a simple string
    return `₹${amount}`;
  }
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