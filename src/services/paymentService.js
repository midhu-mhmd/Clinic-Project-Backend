import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import Payment from "../models/paymentModel.js";
import Tenant from "../models/tenantModel.js";
import Plan from "../models/planModel.js";

/* =========================================================
   Env + Razorpay Client (SAFE: no crash on import)
   - Never throw at top-level during module import
   - Throw only when actually calling Razorpay flow
========================================================= */
const getEnv = (key) => process.env[key];

const requireEnvOnUse = (key) => {
  const val = getEnv(key);
  if (!val) throw new Error(`${key} missing in env.`);
  return val;
};

let razorpayClient = null;

const getRazorpayClient = () => {
  if (razorpayClient) return razorpayClient;

  const key_id = requireEnvOnUse("RAZORPAY_KEY_ID");
  const key_secret = requireEnvOnUse("RAZORPAY_KEY_SECRET");

  razorpayClient = new Razorpay({ key_id, key_secret });
  return razorpayClient;
};

/* =========================================================
   Utils
========================================================= */
const normalizeEmail = (email = "") => String(email).trim().toLowerCase();
const normalizePlanCode = (v) => String(v || "").trim().toUpperCase();
const normalizeCycle = (v) => String(v || "monthly").trim().toLowerCase();

const toPaise = (amountRupees) => {
  const n = Number(amountRupees);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid amount.");
  return Math.round(n * 100);
};

const safeString = (v) => (v === null || v === undefined ? "" : String(v));

const ALLOWED_PLANS = new Set(["PRO", "ENTERPRISE", "PROFESSIONAL"]);
const ALLOWED_CYCLES = new Set(["monthly", "yearly"]);

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/* =========================================================
   0) Get plan price from DB (single source of truth)
========================================================= */
const getPlanPriceRupees = async ({ planCode, billingCycle }) => {
  const code = normalizePlanCode(planCode);
  const cycle = normalizeCycle(billingCycle);

  if (!ALLOWED_PLANS.has(code)) throw new Error("Invalid planCode.");
  if (!ALLOWED_CYCLES.has(cycle)) throw new Error("Invalid billingCycle.");

  const plan = await Plan.findOne({ name: code, isActive: true })
    .select("price name")
    .lean();

  if (!plan) throw new Error(`Plan "${code}" not found or inactive.`);

  const rupees = cycle === "yearly" ? plan.price?.yearly : plan.price?.monthly;
  if (!Number.isFinite(Number(rupees)) || Number(rupees) <= 0) {
    throw new Error(`Invalid price config for plan "${code}" (${cycle}).`);
  }

  return { code, cycle, rupees: Number(rupees) };
};

/* =========================================================
   1) Create Razorpay Order (DB-driven)
   - Always compute amount from Plan DB (never trust frontend)
   - Creates Payment(PENDING)
   - Stores orderId in tenant.subscription.razorpayOrderId
========================================================= */
export const createRazorpayOrderService = async ({
  tenantId,
  userId = null,
  email,
  planCode,
  billingCycle = "monthly",
  currency = "INR",
}) => {
  if (!tenantId || !isValidObjectId(tenantId)) throw new Error("Invalid tenantId.");
  if (userId && !isValidObjectId(userId)) throw new Error("Invalid userId.");
  if (!email) throw new Error("email is required.");

  const emailLower = normalizeEmail(email);

  // ✅ ensure tenant exists
  const tenant = await Tenant.findById(tenantId)
    .select("_id subscription ownerId")
    .lean();

  if (!tenant) throw new Error("Tenant not found.");

  // ✅ compute amount from DB
  const { code, cycle, rupees } = await getPlanPriceRupees({
    planCode,
    billingCycle,
  });

  const amountPaise = toPaise(rupees);
  const razorpay = getRazorpayClient();

  // src/services/paymentService.js

// ... existing code ...

const options = {
  amount: amountPaise,
  currency: String(currency || "INR").toUpperCase(),
  // FIX: Shortened prefix and sliced ID to stay under 40 chars
  // "rcpt_" (5) + ID.slice(-10) (10) + "_" + Date.now() (13) = ~29 chars
  receipt: `rcpt_${String(tenantId).slice(-10)}_${Date.now()}`, 
  notes: {
    tenantId: String(tenantId),
    planCode: code,
    billingCycle: cycle,
    email: emailLower,
  },
};

// ... rest of the code ...

  let order;
  try {
    order = await razorpay.orders.create(options);
  } catch (err) {
    const msg =
      err?.error?.description || err?.message || "Razorpay order creation failed.";
    throw new Error(msg);
  }

  // ✅ Payment record (PENDING)
  // unique sparse index on razorpayOrderId prevents duplicates
  const paymentDoc = await Payment.create({
    tenantId,
    userId,
    email: emailLower,
    amountPaise,
    currency: options.currency,
    purpose: "SUBSCRIPTION",
    planCode: code,
    billingCycle: cycle,
    method: "RAZORPAY",
    status: "PENDING",
    razorpayOrderId: order.id,
    notes: options.notes,
  });

  // ✅ Store selection on tenant (plan chosen during registration/plan-select flow)
  await Tenant.updateOne(
    { _id: tenantId },
    {
      $set: {
        "subscription.plan": code,
        "subscription.billingCycle": cycle,
        "subscription.razorpayOrderId": order.id,
        // keep status pending until verified
        "subscription.status": "PENDING_VERIFICATION",
      },
    }
  );

  return {
    order,
    paymentId: paymentDoc._id,
    amountPaise,
    currency: options.currency,
    planCode: code,
    billingCycle: cycle,
  };
};

/* =========================================================
   2) Verify Signature (pure)
========================================================= */
export const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) return false;

  const secret = requireEnvOnUse("RAZORPAY_KEY_SECRET");
  const text = `${orderId}|${paymentId}`;

  const generated = crypto.createHmac("sha256", secret).update(text).digest("hex");
  return generated === signature;
};

/* =========================================================
   3) Confirm Payment + Activate Subscription
   - Idempotent
   - Updates Payment -> COMPLETED
   - Updates Tenant.subscription.status -> ACTIVE
========================================================= */
export const confirmRazorpayPaymentService = async ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) => {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new Error("Missing payment verification fields.");
  }

  // 1) Find payment record
  const payment = await Payment.findOne({ razorpayOrderId });
  if (!payment) throw new Error("Payment record not found for this order.");

  // ✅ Idempotent: if already completed just return
  if (payment.status === "COMPLETED") {
    // Ensure tenant is active too (safety self-heal)
    await Tenant.updateOne(
      { _id: payment.tenantId, "subscription.status": { $ne: "ACTIVE" } },
      {
        $set: {
          "subscription.plan": payment.planCode,
          "subscription.status": "ACTIVE",
          "subscription.razorpayPaymentId": payment.razorpayPaymentId,
          "subscription.activatedAt": payment.updatedAt || new Date(),
        },
      }
    );

    return {
      status: "COMPLETED",
      tenantId: payment.tenantId,
      planCode: payment.planCode,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
    };
  }

  // 2) Verify signature
  const ok = verifyPaymentSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });

  if (!ok) {
    payment.status = "FAILED";
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    await payment.save();

    throw new Error("Security verification failed: Signature mismatch.");
  }

  // 3) Mark payment completed
  payment.status = "COMPLETED";
  payment.razorpayPaymentId = razorpayPaymentId;
  payment.razorpaySignature = razorpaySignature;
  await payment.save();

  // 4) Activate tenant subscription (CRITICAL FIX for your PENDING_VERIFICATION issue)
  const result = await Tenant.updateOne(
    {
      _id: payment.tenantId,
      "subscription.razorpayOrderId": razorpayOrderId,
    },
    {
      $set: {
        "subscription.plan": payment.planCode,
        "subscription.status": "ACTIVE",
        "subscription.razorpayPaymentId": razorpayPaymentId,
        "subscription.billingCycle": payment.billingCycle || "monthly",
        "subscription.activatedAt": new Date(),
      },
    }
  );

  if (result.matchedCount === 0) {
    throw new Error(
      "Tenant subscription update failed: orderId mismatch or tenant not found."
    );
  }

  return {
    status: "COMPLETED",
    tenantId: payment.tenantId,
    planCode: payment.planCode,
    razorpayOrderId,
    razorpayPaymentId,
  };
};

/* =========================================================
   4) Manual payment submit (creates Payment PENDING)
   - Admin later approves and activates subscription
========================================================= */
export const submitManualPaymentService = async ({
  tenantId,
  userId = null,
  email,
  planCode,
  billingCycle = "monthly",
  transactionRef,
  amountRupees = 0, // optional display only
}) => {
  if (!tenantId || !isValidObjectId(tenantId)) throw new Error("Invalid tenantId.");
  if (userId && !isValidObjectId(userId)) throw new Error("Invalid userId.");
  if (!email) throw new Error("email is required.");
  if (!transactionRef) throw new Error("transactionRef is required.");

  const emailLower = normalizeEmail(email);
  const code = normalizePlanCode(planCode);

  if (!ALLOWED_PLANS.has(code)) throw new Error("Invalid planCode.");

  const cycle = normalizeCycle(billingCycle);
  if (!ALLOWED_CYCLES.has(cycle)) throw new Error("Invalid billingCycle.");

  // For manual, you can still compute canonical amount from DB for consistency
  const { rupees } = await getPlanPriceRupees({ planCode: code, billingCycle: cycle });
  const amountPaise = toPaise(rupees);

  const paymentDoc = await Payment.create({
    tenantId,
    userId,
    email: emailLower,
    amountPaise,
    currency: "INR",
    purpose: "SUBSCRIPTION",
    planCode: code,
    billingCycle: cycle,
    method: "MANUAL",
    status: "PENDING",
    transactionRef: String(transactionRef).trim(),
    metadata: {
      clientAmountRupees: Number(amountRupees) || 0,
    },
  });

  // Keep tenant pending until admin approves
  await Tenant.updateOne(
    { _id: tenantId },
    {
      $set: {
        "subscription.plan": code,
        "subscription.billingCycle": cycle,
        "subscription.status": "PENDING_VERIFICATION",
      },
    }
  );

  return {
    paymentId: paymentDoc._id,
    status: paymentDoc.status,
  };
};

/* =========================================================
   5) List invoices for UI
========================================================= */
export const listTenantInvoicesService = async (tenantId, { limit = 20 } = {}) => {
  if (!tenantId || !isValidObjectId(tenantId)) throw new Error("Invalid tenantId.");

  const rows = await Payment.find({
    tenantId,
    purpose: "SUBSCRIPTION",
    status: "COMPLETED",
  })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 20, 1), 100))
    .lean();

  return rows.map((p) => ({
    id: safeString(p.razorpayOrderId || p._id),
    date: p.createdAt,
    amount: (p.amountPaise || 0) / 100,
    currency: p.currency || "INR",
    planCode: p.planCode,
    billingCycle: p.billingCycle,
    method: p.method,
    status: p.status,
  }));
};
