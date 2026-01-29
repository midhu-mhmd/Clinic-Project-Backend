import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    email: { type: String, required: true },
    amount: { type: Number, required: true },
    plan: { type: String, default: "Professional" },

    method: {
      type: String,
      enum: ["RAZORPAY", "MANUAL"],
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "REFUNDED"],
      default: "PENDING",
    },

    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    transactionRef: { type: String },
    screenshotUrl: { type: String },
  },
  { timestamps: true },
);

export default mongoose.model("Payment", paymentSchema);
