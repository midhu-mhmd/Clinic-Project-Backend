import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "../models/userModel.js";
import connectDB from "../config/db.js";

dotenv.config();

const seedSuperAdmin = async () => {
  try {
    await connectDB();

    const existingAdmin = await User.findOne({
      email: "admin@platform.com"
    });

    if (existingAdmin) {
      console.log("❌ Super Admin already exists");
      process.exit();
    }
    const hashedPassword = await bcrypt.hash("Admin@123", 10);

    await User.create({
      name: "Platform Admin",
      email: "admin@platform.com",
      password: hashedPassword,
      role: "SUPER_ADMIN" 
    });

    console.log("✅ Super Admin seeded successfully");
    process.exit();
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

seedSuperAdmin();