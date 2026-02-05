import express from "express";
import {
  createOrder,
  verifyOrder,
  submitManualPayment,
  getInvoices,
} from "../controllers/paymentController.js";
import { protect, authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.use(authorize("CLINIC_ADMIN"));

router.post("/create-order", createOrder);
router.post("/verify", verifyOrder);
router.post("/manual", submitManualPayment);

// ✅ NEW
router.get("/invoices", getInvoices);

export default router;
