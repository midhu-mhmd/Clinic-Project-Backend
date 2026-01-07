import {
  createRazorpayOrderService,
  verifyPaymentSignature,
  createPaymentRecord,
} from "../services/paymentService.js";

// --- RAZORPAY FLOW ---

// 1. Initiate Order
export const createOrder = async (req, res) => {
  try {
    const { amount, plan } = req.body;
    
    if (!amount) return res.status(400).json({ message: "Amount is required" });

    const order = await createRazorpayOrderService(amount);

    // Optional: Save pending order to DB here if you want to track drop-offs
    
    res.status(200).json(order);
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
};

// 2. Verify & Complete (Call this after success on frontend)
export const verifyOrder = async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      email,
      plan,
      amount 
    } = req.body;

    // Verify Signature
    await verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    // Save Successful Transaction
    const payment = await createPaymentRecord({
      email,
      amount,
      plan,
      method: "RAZORPAY",
      status: "COMPLETED",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    res.status(200).json({ message: "Payment Verified", paymentId: payment._id });
  } catch (error) {
    console.error("Verification Error:", error);
    res.status(400).json({ message: "Invalid Signature or Payment Failed" });
  }
};

// --- MANUAL FLOW ---

// 3. Submit Manual Payment
export const submitManualPayment = async (req, res) => {
  try {
    const { email, amount, plan, transactionRef } = req.body;

    if (!transactionRef) {
      return res.status(400).json({ message: "Transaction Reference (UTR) is required" });
    }

    // Save as Pending
    const payment = await createPaymentRecord({
      email: email || "unknown@user.com", // Fallback if user not logged in
      amount,
      plan,
      method: "MANUAL",
      status: "PENDING", // Needs admin approval
      transactionRef,
    });

    // Optional: Trigger email to Admin to check bank account

    res.status(201).json({ 
      message: "Manual payment submitted for verification", 
      paymentId: payment._id 
    });
  } catch (error) {
    console.error("Manual Payment Error:", error);
    res.status(500).json({ message: "Submission failed" });
  }
};