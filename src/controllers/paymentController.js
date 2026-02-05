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
const ALLOWED_CYCLES = new Set(["monthly", "yearly"]);

const getTenantIdOrNull = (req) => req.user?.tenantId || req.body?.tenantId || null;
const getUserIdOrNull = (req) => req.user?.id || req.user?._id || null;

const getEmailOrNull = (req) => {
  const email = String(req.user?.email || req.body?.email || "")
    .trim()
    .toLowerCase();
  return email || null;
};

const toSafeLimit = (v, def = 20) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), 1), 100);
};

/* =========================================================
   ✅ CREATE ORDER (Razorpay)
   POST /api/payments/create-order
   Body: { planCode, billingCycle }
   Requires: protect + authorize(CLINIC_ADMIN)
========================================================= */
export const createOrder = catchAsync(async (req, res) => {
  const tenantId = getTenantIdOrNull(req);
  const userId = getUserIdOrNull(req);
  const email = getEmailOrNull(req);

  if (!tenantId || !email) {
    return res.status(401).json({
      success: false,
      message: "Auth context missing. Please login again.",
    });
  }

  const planCode = normalizePlanCode(req.body.planCode || req.body.plan);
  const billingCycle = normalizeCycle(req.body.billingCycle || "monthly");

  if (!ALLOWED_PLANS.has(planCode)) {
    return res.status(400).json({
      success: false,
      message: "Invalid planCode. Allowed: PRO, ENTERPRISE, PROFESSIONAL.",
    });
  }

  if (!ALLOWED_CYCLES.has(billingCycle)) {
    return res.status(400).json({
      success: false,
      message: "Invalid billingCycle. Allowed: monthly, yearly.",
    });
  }

  // service will throw if env is missing; catchAsync will pass to error handler
  const result = await createRazorpayOrderService({
    tenantId,
    userId,
    email,
    planCode,
    billingCycle,
    currency: "INR",
  });

  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    return res.status(500).json({
      success: false,
      message: "Razorpay key missing in server env.",
    });
  }

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
      keyId, // required for frontend Razorpay checkout
    },
  });
});

/* =========================================================
   ✅ VERIFY + ACTIVATE SUBSCRIPTION
   POST /api/payments/verify
   Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
   Requires: protect + authorize(CLINIC_ADMIN)
========================================================= */
export const verifyOrder = catchAsync(async (req, res) => {
  const tenantId = getTenantIdOrNull(req);
  if (!tenantId) {
    return res.status(401).json({
      success: false,
      message: "Auth context missing. Please login again.",
    });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({
      success: false,
      message: "Missing Razorpay verification fields.",
    });
  }

  const result = await confirmRazorpayPaymentService({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  });

  // ✅ SECURITY: ensure payment belongs to this tenant
  if (String(result.tenantId) !== String(tenantId)) {
    return res.status(403).json({
      success: false,
      message: "Payment does not belong to this tenant.",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Payment verified and subscription activated.",
    data: result,
  });
});

/* =========================================================
   ✅ MANUAL PAYMENT SUBMISSION
   POST /api/payments/manual
   Body: { planCode, transactionRef, billingCycle?, amountRupees? }
   Requires: protect + authorize(CLINIC_ADMIN)
========================================================= */
export const submitManualPayment = catchAsync(async (req, res) => {
  const tenantId = getTenantIdOrNull(req);
  const userId = getUserIdOrNull(req);
  const email = getEmailOrNull(req);

  if (!tenantId || !email) {
    return res.status(401).json({
      success: false,
      message: "Auth context missing. Please login again.",
    });
  }

  const transactionRef = String(req.body?.transactionRef || "").trim();
  const planCode = normalizePlanCode(req.body?.planCode || req.body?.plan);
  const billingCycle = normalizeCycle(req.body?.billingCycle || "monthly");
  const amountRupees = Number(req.body?.amountRupees || 0);

  if (!transactionRef) {
    return res.status(400).json({
      success: false,
      message: "Transaction Reference (UTR) is required.",
    });
  }

  if (!ALLOWED_PLANS.has(planCode)) {
    return res.status(400).json({
      success: false,
      message: "Invalid planCode. Allowed: PRO, ENTERPRISE, PROFESSIONAL.",
    });
  }

  if (!ALLOWED_CYCLES.has(billingCycle)) {
    return res.status(400).json({
      success: false,
      message: "Invalid billingCycle. Allowed: monthly, yearly.",
    });
  }

  const result = await submitManualPaymentService({
    tenantId,
    userId,
    email,
    planCode,
    billingCycle,
    transactionRef,
    amountRupees,
  });

  return res.status(201).json({
    success: true,
    message: "Manual payment submitted for verification.",
    data: result,
  });
});

/* =========================================================
   ✅ INVOICES (for Billing UI)
   GET /api/payments/invoices?limit=20
   Requires: protect + authorize(CLINIC_ADMIN)
========================================================= */
export const getInvoices = catchAsync(async (req, res) => {
  const tenantId = getTenantIdOrNull(req);

  if (!tenantId) {
    return res.status(401).json({
      success: false,
      message: "Auth context missing. Please login again.",
    });
  }

  const limit = toSafeLimit(req.query?.limit, 20);
  const data = await listTenantInvoicesService(tenantId, { limit });

  return res.status(200).json({
    success: true,
    message: "Invoices fetched.",
    data,
  });
});
