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

/**
 * ✅ PLAN-SAFE uniqueness:
 * Same email can exist in different clinics,
 * but must be unique within a tenant.
 */
doctorSchema.index({ tenantId: 1, email: 1 }, { unique: true });

/**
 * ✅ Fast queries (for 5000 clinics / large doctor sets)
 * Typical filters: tenantId + isDeleted + isActive + status
 */
doctorSchema.index({ tenantId: 1, isDeleted: 1, isActive: 1, status: 1 });

/**
 * ✅ If you sort by latest created doctors in tenant dashboards
 */
doctorSchema.index({ tenantId: 1, createdAt: -1 });

/**
 * ✅ Soft-delete filter (industry pattern)
 * - Uses `where()` to avoid recursion/overhead
 * - Allows opt-out using `.setOptions({ includeDeleted: true })`
 */
doctorSchema.pre(/^find/, function (next) {
  const opts = this.getOptions?.() || {};
  if (opts.includeDeleted) return next();
  this.where({ isDeleted: { $ne: true } });
  next();
});

/**
 * ✅ Normalize email always before save
 */
doctorSchema.pre("save", function (next) {
  if (this.email) this.email = String(this.email).trim().toLowerCase();
  next();
});

/**
 * ✅ Soft delete helper method (optional but clean)
 */
doctorSchema.methods.softDelete = async function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.isActive = false;
  return this.save();
};

const Doctor = mongoose.model("Doctor", doctorSchema);
export default Doctor;
