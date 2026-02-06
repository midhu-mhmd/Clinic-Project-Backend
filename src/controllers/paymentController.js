import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import {
  createRazorpayOrderService,
  confirmRazorpayPaymentService,
  submitManualPaymentService,
  listTenantInvoicesService,
} from "../services/paymentService.js";

/* =========================================================
   Small utils
========================================================= */
const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const normalizePlanCode = (v) => String(v || "").trim().toUpperCase();
const normalizeCycle = (v) => String(v || "monthly").trim().toLowerCase();

const ALLOWED_PLANS = new Set(["PRO", "ENTERPRISE", "PROFESSIONAL"]);

const getTenantIdOrNull = (req) => {
  const id = req.user?.tenantId || req.body?.tenantId || null;
  return id ? String(id) : null;
};

const getUserIdOrNull = (req) => {
  const id = req.user?.id || req.user?._id || null;
  return id ? String(id) : null;
};

const getEmailOrNull = (req) => {
  const email = String(req.user?.email || req.body?.email || "").trim().toLowerCase();
  return email || null;
};

const toSafeLimit = (v, def = 20) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), 1), 100);
};

/* =========================================================
   ✅ CREATE ORDER (Razorpay)
========================================================= */
export const createOrder = catchAsync(async (req, res) => {
  const tenantId = getTenantIdOrNull(req);
  const userId = getUserIdOrNull(req);
  const email = getEmailOrNull(req);

  if (!tenantId || !email) {
    return res.status(401).json({
      success: false,
      message: "Authentication context missing. Please login again.",
    });
  }

  const planCode = normalizePlanCode(req.body.planCode || req.body.plan);
  const billingCycle = normalizeCycle(req.body.billingCycle || "monthly");

  if (!ALLOWED_PLANS.has(planCode)) {
    return res.status(400).json({
      success: false,
      message: "Invalid plan code selected.",
    });
  }

  const result = await createRazorpayOrderService({
    tenantId,
    userId,
    email,
    planCode,
    billingCycle,
    currency: "INR",
  });

  return res.status(200).json({
    success: true,
    message: "Order created.",
    data: {
      order: result.order,
      paymentId: result.paymentId,
      amountPaise: result.amountPaise,
      currency: result.currency,
      planCode: result.planCode,
      billingCycle: result.billingCycle,
      keyId: process.env.RAZORPAY_KEY_ID,
    },
  });
});

/* =========================================================
   ✅ VERIFY + ACTIVATE SUBSCRIPTION
========================================================= */
export const verifyOrder = catchAsync(async (req, res) => {
  const tenantId = getTenantIdOrNull(req);
  if (!tenantId) {
    return res.status(401).json({
      success: false,
      message: "Session context missing. Please restart the process.",
    });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({
      success: false,
      message: "Payment verification data missing.",
    });
  }

  // 1. Service Call to finalize DB entry
  const result = await confirmRazorpayPaymentService({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  });

  // 2. Tenant matching validation
  if (String(result.tenantId) !== tenantId) {
    return res.status(403).json({
      success: false,
      message: "Security mismatch: Payment record does not match current tenant.",
    });
  }

  // 3. Upgrade User to "AUTH" status
  // We find the user and explicitly convert IDs to strings for the JWT payload
  const user = await User.findOne({ tenantId: result.tenantId }).sort({ createdAt: 1 });
  
  if (!user) {
    return res.status(404).json({ success: false, message: "Administrative user not found." });
  }

  // 4. Generate the FULL ACCESS token
  const authToken = jwt.sign(
    {
      id: String(user._id),
      tenantId: String(user.tenantId),
      role: user.role,
      purpose: "AUTH", // THIS IS THE GATE PASS for 'protect' middleware
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  // 5. Audit update
  user.lastActive = new Date();
  await user.save({ validateBeforeSave: false });

  return res.status(200).json({
    success: true,
    message: "Subscription activated. Access granted.",
    token: authToken, // Frontend MUST replace the old token with this
    role: user.role,
    data: {
      plan: result.planCode,
      status: "ACTIVE"
    },
  });
});

/* =========================================================
   ✅ MANUAL PAYMENT SUBMISSION
========================================================= */
export const submitManualPayment = catchAsync(async (req, res) => {
  const tenantId = getTenantIdOrNull(req);
  const userId = getUserIdOrNull(req);
  const email = getEmailOrNull(req);

  if (!tenantId || !email) {
    return res.status(401).json({ success: false, message: "Context missing." });
  }

  const result = await submitManualPaymentService({
    tenantId,
    userId,
    email,
    planCode: normalizePlanCode(req.body.planCode),
    billingCycle: normalizeCycle(req.body.billingCycle),
    transactionRef: req.body.transactionRef,
    amountRupees: req.body.amountRupees,
  });

  return res.status(201).json({
    success: true,
    message: "Protocol submitted for manual review.",
    data: result,
  });
});

/* =========================================================
   ✅ INVOICES
========================================================= */
export const getInvoices = catchAsync(async (req, res) => {
  const tenantId = getTenantIdOrNull(req);
  if (!tenantId) return res.status(401).json({ success: false, message: "Access denied." });

  const limit = toSafeLimit(req.query?.limit, 20);
  const data = await listTenantInvoicesService(tenantId, { limit });

  return res.status(200).json({ success: true, data });
});