import dotenv from "dotenv";
import mongoose from "mongoose";
import slugify from "slugify";
import Plan from "../models/planModel.js"; // adjust path if needed

dotenv.config();

const PLANS = [
  {
    name: "PRO",
    description: "For small clinics getting started with core appointment & tenant management.",
    price: { monthly: 1999, yearly: 19990, currency: "INR" },
    limits: { maxDoctors: 3, maxPatients: 500, maxStorageGB: 10, allowAPI: false, customBranding: false },
    features: ["Clinic onboarding", "Doctor management", "Appointments", "Basic support"],
    isActive: true,
    tierLevel: 1,
  },
  {
    name: "ENTERPRISE",
    description: "For growing clinics needing higher scale and advanced access controls.",
    price: { monthly: 4999, yearly: 49990, currency: "INR" },
    limits: { maxDoctors: 5, maxPatients: 5000, maxStorageGB: 100, allowAPI: true, customBranding: true },
    features: ["Everything in PRO", "RBAC access control", "Advanced analytics", "Priority support", "API access", "Custom branding"],
    isActive: true,
    tierLevel: 2,
  },
  {
    name: "PROFESSIONAL",
    description: "Unlimited plan for premium clinics and networks.",
    price: { monthly: 7999, yearly: 79990, currency: "INR" },
    limits: { maxDoctors: -1, maxPatients: -1, maxStorageGB: -1, allowAPI: true, customBranding: true },
    features: ["Everything in ENTERPRISE", "Unlimited doctors/patients/storage", "Dedicated onboarding", "SLA support"],
    isActive: true,
    tierLevel: 3,
  },
];

function withSlug(plan) {
  const name = String(plan.name).trim().toUpperCase();
  return {
    ...plan,
    name,
    slug: slugify(name, { lower: true, strict: true }),
  };
}

async function seedPlans() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing in .env");

  await mongoose.connect(uri);

  // ✅ Ensure no old bad docs block unique slug
  await Plan.deleteMany({ slug: null });

  const ops = PLANS.map((p) => {
    const doc = withSlug(p);
    return {
      updateOne: {
        filter: { name: doc.name },
        update: { $set: doc },
        upsert: true,
      },
    };
  });

  const result = await Plan.bulkWrite(ops, { ordered: true });

  console.log("✅ Plans seeded/updated:", {
    upserted: result.upsertedCount,
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });

  await mongoose.disconnect();
  process.exit(0);
}

seedPlans().catch((e) => {
  console.error("❌ seedPlans failed:", e.message);
  process.exit(1);
});
