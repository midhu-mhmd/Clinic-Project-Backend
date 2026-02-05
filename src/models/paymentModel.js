import mongoose from "mongoose";

const { Schema } = mongoose;

const METHODS = ["RAZORPAY", "MANUAL"];
const STATUSES = ["PENDING", "COMPLETED", "FAILED", "REFUNDED"];
const PURPOSES = ["SUBSCRIPTION"]; // extend later
const PLAN_CODES = ["PRO", "ENTERPRISE", "PROFESSIONAL"];
const BILLING_CYCLES = ["monthly", "yearly"];

const paymentSchema = new Schema(
  {
    /* ===========================
       Ownership / Scope
    ============================ */

    // ✅ Most important: which tenant this payment is for
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    // Optional user reference (clinic admin)
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    /* ===========================
       Amount / Plan
    ============================ */

    // ✅ store in smallest currency unit (paise for INR)
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "amountPaise must be an integer (smallest currency unit).",
      },
    },

    currency: { type: String, default: "INR", uppercase: true },

    purpose: {
      type: String,
      enum: PURPOSES,
      default: "SUBSCRIPTION",
      index: true,
    },

    planCode: {
      type: String,
      enum: PLAN_CODES,
      required: true,
      index: true,
    },

    billingCycle: {
      type: String,
      enum: BILLING_CYCLES,
      default: "monthly",
      index: true,
    },

    method: {
      type: String,
      enum: METHODS,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: STATUSES,
      default: "PENDING",
      index: true,
    },

    /* ===========================
       Razorpay fields
    ============================ */
    razorpayOrderId: { type: String, default: null, trim: true },
    razorpayPaymentId: { type: String, default: null, trim: true },
    razorpaySignature: { type: String, default: null, trim: true },

    /* ===========================
       Manual payments fields
    ============================ */
    transactionRef: { type: String, default: null, trim: true },
    screenshotUrl: { type: String, default: null, trim: true },

    /* ===========================
       Extra audit / debug
    ============================ */
    notes: { type: Schema.Types.Mixed, default: null }, // e.g. razorpay notes
    metadata: { type: Schema.Types.Mixed, default: null }, // ip, user-agent, etc.
  },
  { timestamps: true }
);

/* ===========================
   Indexes (Performance + Safety)
=========================== */

// Avoid duplicate order/payment entries (sparse = allow nulls)
paymentSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });

// Fast queries: tenant billing history
paymentSchema.index({ tenantId: 1, createdAt: -1 });

// Useful: completed payments per tenant
paymentSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

// Often used filters
paymentSchema.index({ tenantId: 1, purpose: 1, createdAt: -1 });
paymentSchema.index({ tenantId: 1, planCode: 1, billingCycle: 1, createdAt: -1 });

/* ===========================
   Normalization hooks
=========================== */
paymentSchema.pre("save", function normalize() {
  if (this.email) this.email = String(this.email).trim().toLowerCase();
  if (this.razorpayOrderId) this.razorpayOrderId = String(this.razorpayOrderId).trim();
  if (this.razorpayPaymentId) this.razorpayPaymentId = String(this.razorpayPaymentId).trim();
  if (this.transactionRef) this.transactionRef = String(this.transactionRef).trim();
});

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
