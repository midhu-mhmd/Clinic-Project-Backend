import Razorpay from "razorpay";
import crypto from "crypto";
import Payment from "../models/paymentModel.js";
import dotenv from "dotenv";

// Initialize dotenv in this file to ensure keys are available immediately
dotenv.config();

// Debugging check (optional, but helpful for development)
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("❌ RAZORPAY KEYS MISSING: Check your .env file at the root.");
}

// Initialize Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * 1. Create a Razorpay Order
 */
export const createRazorpayOrderService = async (amount, currency = "INR") => {
  const options = {
    amount: Math.round(amount * 100), // Convert to paise and ensure it's an integer
    currency,
    receipt: `receipt_${Date.now()}`,
    // Note: 'payment_capture' is now handled automatically by Razorpay or 
    // during the verification step depending on your account settings.
  };

  try {
    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    console.error("Razorpay SDK Order Error:", error);
    throw new Error("Razorpay Error: " + error.message);
  }
};

/**
 * 2. Verify Razorpay Signature
 */
export const verifyPaymentSignature = async (orderId, paymentId, signature) => {
  const text = orderId + "|" + paymentId;
  
  const generated_signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(text.toString())
    .digest("hex");

  if (generated_signature === signature) {
    return true;
  } else {
    throw new Error("Invalid Payment Signature: Security verification failed.");
  }
};

/**
 * 3. Create/Save a Payment Record in DB
 */
export const createPaymentRecord = async (data) => {
  return await Payment.create(data);
};  