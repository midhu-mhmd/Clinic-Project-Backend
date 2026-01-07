import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      // Optional: might be null if user pays before full registration
      default: null, 
    },
    email: { type: String, required: true },
    amount: { type: Number, required: true },
    plan: { type: String, default: "Professional" },
    
    // Payment Method: 'RAZORPAY' or 'MANUAL'
    method: { 
      type: String, 
      enum: ["RAZORPAY", "MANUAL"], 
      required: true 
    },

    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "REFUNDED"],
      default: "PENDING",
    },

    // Razorpay Specific Fields
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    // Manual Payment Specific Fields
    transactionRef: { type: String }, // The UTR / Ref Number entered by user
    screenshotUrl: { type: String },  // If you implement file upload later
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);