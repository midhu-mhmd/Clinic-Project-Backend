import mongoose from "mongoose";
import slugify from "slugify"; // Recommend installing: npm install slugify

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Plan name is required"],
      trim: true,
      unique: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
      index: true, 
    },
    slug: {
      type: String,
      lowercase: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      maxlength: [200, "Description cannot exceed 200 characters"],
      trim: true,
    },
    price: {
      monthly: { 
        type: Number, 
        required: true, 
        min: [0, "Price cannot be negative"] 
      },
      yearly: { 
        type: Number, 
        required: true, 
        min: [0, "Price cannot be negative"] 
      },
      currency: { 
        type: String, 
        default: "USD",
        uppercase: true,
        enum: ["USD", "EUR", "GBP", "INR"], // Strict enum for financial safety
      }
    },
    // LIMITS: Using -1 for "Unlimited" is an industry convention
    limits: {
      maxDoctors: { type: Number, default: 5, min: -1 },
      maxPatients: { type: Number, default: 100, min: -1 },
      maxStorageGB: { type: Number, default: 10, min: -1 },
      allowAPI: { type: Boolean, default: false },
      customBranding: { type: Boolean, default: false }
    },
    features: {
      type: [String], // Array of strings shorthand
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true, // Crucial for performance: we nearly always query { isActive: true }
    },
    tierLevel: {
      type: Number,
      required: true,
      unique: true, // Prevents two plans from having the same priority order
      min: 1,
    }
  },
  {
    timestamps: true,
    // JSON transformation: Clean up the output for the frontend automatically
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true }
  }
);

// COMPOUND INDEX: 
// Optimizes the most common query: "Give me all active plans sorted by tier"
planSchema.index({ isActive: 1, tierLevel: 1 });

// MIDDLEWARE: Robust Slug Generation
planSchema.pre("save", function (next) {
  if (!this.isModified("name")) return next();
  
  // 'slugify' handles special chars better than split/join (e.g., "Pro & Enterprise" -> "pro-and-enterprise")
  this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

// STATIC METHOD: Encapsulate business logic on the model
planSchema.statics.getPublicTiers = function () {
  return this.find({ isActive: true })
    .sort({ tierLevel: 1 })
    .lean(); // .lean() converts to plain JS objects -> 5x faster for reads
};

// INSTANCE METHOD: Check if a specific limit is reached
planSchema.methods.checkLimit = function (limitKey, currentUsage) {
  const limit = this.limits[limitKey];
  if (limit === -1) return true; // Unlimited
  return currentUsage < limit;
};

const Plan = mongoose.model("Plan", planSchema);
export default Plan;