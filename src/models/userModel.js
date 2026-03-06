import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "CLINIC_ADMIN", "PATIENT"],
      default: "PATIENT",
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationOtp: {
      type: String,
      default: null,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    otpExpires: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    dob: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
      enum: ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY", null],
      default: null,
    },
    bloodGroup: {
      type: String,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: null,
    },
    image: {
      type: String,
      default: null,
    },
    imagePublicId: {
      type: String,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);
