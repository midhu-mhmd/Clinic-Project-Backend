import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

// 1. Ensure dotenv is called within this module just in case
dotenv.config();

const configureCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  if (!CLOUDINARY_API_KEY || !CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_SECRET) {
    console.error("❌ Cloudinary Error: Missing environment variables.");
    // This will help you debug exactly what is missing in your console
    console.log("Current Keys:", { 
        name: !!CLOUDINARY_CLOUD_NAME, 
        key: !!CLOUDINARY_API_KEY, 
        secret: !!CLOUDINARY_API_SECRET 
    });
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });

  return cloudinary;
};

// Initialize it immediately
configureCloudinary();

export default cloudinary;