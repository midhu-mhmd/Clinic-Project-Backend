import express from "express";
import {
  createOrder,
  verifyOrder,
  submitManualPayment,
  getInvoices,
} from "../controllers/paymentController.js";
// ✅ Import protectPayment specifically
import { protect, protectPayment, authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();

/* =========================================================
   1) PAYMENT FLOW ROUTES
   Use protectPayment because the user only has a 
   restricted "PAYMENT" token from the OTP stage.
========================================================= */
router.post("/create-order", protectPayment, authorize("CLINIC_ADMIN"), createOrder);
router.post("/verify", protectPayment, authorize("CLINIC_ADMIN"), verifyOrder);
router.post("/manual", protectPayment, authorize("CLINIC_ADMIN"), submitManualPayment);

/* =========================================================
   2) POST-PAYMENT / DASHBOARD ROUTES
   Use protect because these require a full "AUTH" token
   issued after successful payment.
========================================================= */
router.get("/invoices", protect, authorize("CLINIC_ADMIN"), getInvoices);

export default router;