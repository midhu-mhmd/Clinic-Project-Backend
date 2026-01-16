import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";

const getTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * @desc    Step 1: Register Clinic & Owner, Send OTP
 */
export const registerClinicTransaction = async (ownerData, clinicData) => {
  try {
    // 1. Normalize Email
    const emailLower = ownerData.email.toLowerCase().trim();

    // 2. Check for existing user
    const existingUser = await User.findOne({ email: emailLower });
    if (existingUser) throw new Error("Email is already registered.");

    // 3. Prepare Security & OTP
    const hashedPassword = await bcrypt.hash(ownerData.password, 12);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 Minutes

    // 4. Create User (isVerified: false)
    const user = new User({
      name: ownerData.name,
      email: emailLower,
      password: hashedPassword,
      phone: ownerData.phone || "0000000000",
      role: "CLINIC_ADMIN",
      isVerified: false,
      verificationOtp: otp,
      otpExpires: otpExpires,
    });

    // 5. Create Tenant (Clinic)
    const tenant = new Tenant({
      name: clinicData.name,
      address: clinicData.address,
      registrationId: clinicData.registrationId,
      image: clinicData.image,
      ownerId: user._id,
      settings: { isPublic: true },
      subscription: { plan: "FREE", status: "ACTIVE" },
    });

    // 6. Cross-link and Save
    await tenant.save();
    user.tenantId = tenant._id;
    await user.save();

    // 7. Send Verification Email
    const transporter = getTransporter();
    const mailOptions = {
      from: `"Medicare Admin" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Verify Your Clinic Registration",
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Welcome to Medicare!</h2>
          <p>Your verification code for clinic registration is:</p>
          <h1 style="color: #10b981; letter-spacing: 5px;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📩 OTP Sent to: ${user.email}`);

    return { user, tenant };
  } catch (error) {
    console.error("Registration Error:", error.message);
    throw error;
  }
};

/**
 * @desc    Step 2: Verify OTP & Issue JWT
 */
export const verifyUserEmail = async (email, otp) => {
  try {
    const emailLower = email.toLowerCase().trim();
    
    // 1. Find user by email
    const user = await User.findOne({ email: emailLower });
    if (!user) throw new Error("User not found.");

    // 2. Debugging Logs
    console.log("--- VERIFICATION CHECK ---");
    console.log("Attempting OTP:", otp);
    console.log("Database OTP:", user.verificationOtp);

    // 3. Validation Logic
    if (String(user.verificationOtp) !== String(otp)) {
      throw new Error("Invalid verification code.");
    }

    if (user.otpExpires < Date.now()) {
      throw new Error("Verification code has expired. Please resend.");
    }

    // 4. Update User Status
    user.isVerified = true;
    user.verificationOtp = undefined; // Clear OTP
    user.otpExpires = undefined;     // Clear Expiry
    await user.save();

    // 5. Generate JWT Token (Important for Frontend Login)
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role, 
        tenantId: user.tenantId 
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return { 
      token, 
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      } 
    };
  } catch (error) {
    console.error("❌ Verification Error:", error.message);
    throw error;
  }
};

/**
 * @desc    Resend OTP Logic
 */
export const resendOTP = async (email) => {
  try {
    const emailLower = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailLower });
    if (!user) throw new Error("User not found.");

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationOtp = newOtp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Medicare Admin" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "New Verification Code",
      html: `<p>Your new verification code is: <b style="font-size: 24px;">${newOtp}</b></p>`,
    });

    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * @desc    Clinic Management Helpers
 */
export const getAllPublicClinics = async () => {
  return await Tenant.find({ "settings.isPublic": true }).lean();
};

export const getTenantByOwnerId = async (ownerId) => {
  return await Tenant.findOne({ ownerId }).lean();
};

export const updateTenantSettings = async (tenantId, updates) => {
  return await Tenant.findByIdAndUpdate(tenantId, { $set: updates }, { new: true });
};