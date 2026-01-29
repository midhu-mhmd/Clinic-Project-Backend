import express from "express";
import {
  createOrder,
  verifyOrder,
  submitManualPayment,
} from "../controllers/paymentController.js";

const router = express.Router();

router.post("/create-order", createOrder);
router.post("/verify", verifyOrder);

router.post("/manual", submitManualPayment);

export default router;
