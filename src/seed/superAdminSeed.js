import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import userModel from "../models/userModel.js";  
import connectDB from "../config/db.js";

dotenv.config();

const seedSuperAdmin = async () => {
  try {
    await connectDB();

    const existingAdmin = await userModel.findOne({
      email: "admin@platform.com"
    });

    if (existingAdmin) {
      console.log("❌ Super Admin already exists");
      process.exit();
    }
    const hashedPassword = await bcrypt.hash("Admin@123", 10);

    await userModel.create({
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