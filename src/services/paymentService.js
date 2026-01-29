import Razorpay from "razorpay";
import crypto from "crypto";
import Payment from "../models/paymentModel.js";
import dotenv from "dotenv";

dotenv.config();

console.log("-----------------------------------------");
console.log("💳 Razorpay Initializing...");
console.log("ID:", process.env.RAZORPAY_KEY_ID ? "✅ Loaded" : "❌ MISSING");
console.log(
  "Secret:",
  process.env.RAZORPAY_KEY_SECRET ? "✅ Loaded" : "❌ MISSING",
);
console.log("-----------------------------------------");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

export const createRazorpayOrderService = async (amount, currency = "INR") => {
  const options = {
    amount: Math.round(Number(amount) * 100),
    currency,
    receipt: `receipt_${Date.now()}`,
  };

  try {
    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    const errorMsg =
      error.error?.description || error.message || "Unknown Razorpay Error";
    console.error("❌ Razorpay SDK Order Error:", errorMsg);
    if (process.env.NODE_ENV !== "production") {
      console.log("Full Error Object:", JSON.stringify(error, null, 2));
    }

    throw new Error(errorMsg);
  }
};

export const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const text = orderId + "|" + paymentId;

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(text.toString())
      .digest("hex");

    if (generated_signature === signature) {
      return true;
    } else {
      throw new Error("Security verification failed: Signature mismatch.");
    }
  } catch (error) {
    console.error("❌ Signature Verification Error:", error.message);
    throw error;
  }
};

export const createPaymentRecord = async (data) => {
  try {
    return await Payment.create(data);
  } catch (error) {
    console.error("❌ Database Error (Payment Record):", error.message);
    throw new Error("Failed to save payment record to database.");
  }
};
