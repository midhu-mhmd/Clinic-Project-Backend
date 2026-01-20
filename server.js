import dotenv from "dotenv";
import path from "path";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import connectDB from "./src/config/db.js";
import router from "./src/routes/userRoute.js";
import tenantRoute from "./src/routes/tenantRoute.js";
import paymentRoute from "./src/routes/paymentRoute.js";
import doctorRouter from "./src/routes/doctorRoute.js";

const app = express();

// 1. DATABASE CONNECTION
connectDB();

// 2. GLOBAL MIDDLEWARE
// 2. GLOBAL MIDDLEWARE
app.use(
  cors({
    origin: "http://localhost:5173", // Verified your Vite port
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allows images from Cloudinary to load
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "https://res.cloudinary.com"], // Essential for Cloudinary images
      },
    },
  })
);

app.use(express.json()); // Parses incoming JSON requests
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// 3. ROUTES
app.use("/api/users", router);
app.use("/api/tenants", tenantRoute);
app.use("/api/payments", paymentRoute);
app.use("/api/doctors", doctorRouter);

// 4. CATCH 404 (For non-existent routes)
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
});

// 5. GLOBAL ERROR HANDLER (This solves "next is not a function")
// In Express, a middleware with 4 arguments is an error handler.
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  console.error("--- SERVER ERROR LOG ---");
  console.error(err.stack); // This prints the real error to your VS Code terminal
  console.error("------------------------");

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    // Only show stack trace in development mode
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
});

// 6. SERVER START
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});