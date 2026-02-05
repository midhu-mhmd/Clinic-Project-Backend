import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";

import connectDB from "./src/config/db.js";

import router from "./src/routes/userRoute.js";
import tenantRoute from "./src/routes/tenantRoute.js";
import paymentRouter from "./src/routes/paymentRoute.js";
import doctorRouter from "./src/routes/doctorRoute.js";
import appointmentRouter from "./src/routes/appointmentRoute.js";
import planRouter from "./src/routes/planRoute.js";

const app = express();

/**
 * 1) GLOBAL MIDDLEWARE
 */
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "https://res.cloudinary.com"],
      },
    },
  })
);

app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

/**
 * 2) ROUTES
 */
app.use("/api/users", router);
app.use("/api/tenants", tenantRoute);
app.use("/api/payments", paymentRouter);
app.use("/api/doctors", doctorRouter);
app.use("/api/appointments", appointmentRouter);
app.use("/api/plans", planRouter);

/**
 * 3) CATCH 404
 */
app.use((req, res, next) => {
  res.status(404);
  next(new Error(`Not Found - ${req.originalUrl}`));
});

/**
 * 4) GLOBAL ERROR HANDLER
 */
app.use((err, req, res, next) => {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  console.error("--- SERVER ERROR LOG ---");
  console.error(err.stack || err);
  console.error("------------------------");

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
});

/**
 * 5) BOOTSTRAP (DB first, then server)
 */
const PORT = process.env.PORT || 5000;

async function bootstrap() {
  await connectDB(); // ✅ IMPORTANT: wait for Mongo

  app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("❌ Boot failed:", err.message);
  process.exit(1);
});
