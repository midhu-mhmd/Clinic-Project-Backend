import {
  createRazorpayOrderService,
  verifyPaymentSignature,
  createPaymentRecord,
} from "../services/paymentService.js";

export const createOrder = async (req, res) => {
  try {
    const { amount, plan } = req.body;
    
    if (!amount) return res.status(400).json({ message: "Amount is required" });

    const order = await createRazorpayOrderService(amount);

    res.status(200).json(order);
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
};

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

    await verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

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


export const submitManualPayment = async (req, res) => {
  try {
    const { email, amount, plan, transactionRef } = req.body;

    if (!transactionRef) {
      return res.status(400).json({ message: "Transaction Reference (UTR) is required" });
    }

    const payment = await createPaymentRecord({
      email: email || "unknown@user.com", 
      amount,
      plan,
      method: "MANUAL",
      status: "PENDING", 
      transactionRef,
    });


    res.status(201).json({ 
      message: "Manual payment submitted for verification", 
      paymentId: payment._id 
    });
  } catch (error) {
    console.error("Manual Payment Error:", error);
    res.status(500).json({ message: "Submission failed" });
  }
};