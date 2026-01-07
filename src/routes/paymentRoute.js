import express from "express";
import { 
  createOrder, 
  verifyOrder, 
  submitManualPayment 
} from "../controllers/paymentController.js";

const router = express.Router();

// Razorpay Routes
router.post("/create-order", createOrder);
router.post("/verify", verifyOrder);

// Manual Route
router.post("/manual", submitManualPayment);

export default router;