import mongoose from "mongoose";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

const doctorSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => emailRegex.test(String(v || "")),
        message: "Invalid email format",
      },
    },
    specialization: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
      index: true,
    },
    consultationFee: {
      type: Number,
      required: [true, "Please specify the consultation fee"],
      min: [0, "Fee cannot be negative"],
      default: 0,
    },
    education: {
      type: String,
      default: "Medical Degree",
      maxlength: 120,
    },
    experience: {
      type: Number,
      default: 0,
      min: 0,
      max: 80,
    },
    status: {
      type: String,
      enum: ["On Duty", "On Break", "Off Duty"],
      default: "On Duty",
      index: true,
    },
    availability: {
      type: String,
      default: "09:00 AM - 05:00 PM",
      maxlength: 60,
    },
    image: {
      type: String,
      default: "",
    },
    imagePublicId: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// --- INDEXES ---
doctorSchema.index({ tenantId: 1, email: 1 }, { unique: true });
doctorSchema.index({ tenantId: 1, isDeleted: 1, isActive: 1, status: 1 });
doctorSchema.index({ tenantId: 1, createdAt: -1 });

// --- MIDDLEWARE ---

/**
 * ✅ FIX 1: Use ASYNC for Query Middleware
 * Removing 'next' parameter prevents "next is not a function" error.
 * Mongoose automatically handles async functions.
 */
doctorSchema.pre(/^find/, async function () {
  // Safe check for options using optional chaining
  const opts = this.getOptions ? this.getOptions() : {};
  
  // If includeDeleted is true, we simply return (exit) to show everything
  if (opts.includeDeleted) {
    return; 
  }

  // Otherwise, filter out soft-deleted docs
  this.where({ isDeleted: { $ne: true } });
});

/**
 * ✅ FIX 2: Use ASYNC for Save Middleware
 * Consistent with modern Mongoose practices.
 */
doctorSchema.pre("save", async function () {
  if (this.isModified("email") && this.email) {
    this.email = String(this.email).trim().toLowerCase();
  }
});

// --- METHODS ---

doctorSchema.methods.softDelete = async function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.isActive = false;
  return this.save();
};

const Doctor = mongoose.model("Doctor", doctorSchema);
export default Doctor;