import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

import connectDB from "./src/config/db.js";
import registerSignalingHandlers from "./src/socket/signalingHandler.js";
import { startVideoReminderScheduler } from "./src/scheduler/videoReminder.js";
import { startSlaEnforcer } from "./src/scheduler/slaEnforcer.js";

import router from "./src/routes/userRoute.js";
import tenantRoute from "./src/routes/tenantRoute.js";
import paymentRouter from "./src/routes/paymentRoute.js";
import doctorRouter from "./src/routes/doctorRoute.js";
import appointmentRouter from "./src/routes/appointmentRoute.js";
import planRouter from "./src/routes/planRoute.js";
import adminRouter from "./src/routes/adminRoutes.js";
import ticketRouter from "./src/routes/ticketRoute.js";
import notificationRouter from "./src/routes/notificationRoute.js";
import videoConsultationRouter from "./src/routes/videoConsultationRoute.js";
import chatbotRouter from "./src/routes/chatbotRoute.js";

const app = express();
const httpServer = createServer(app);

const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:4000",
  "http://127.0.0.1:4001",
  "http://localhost:4000",
  "http://localhost:4001",
];

/**
 * Socket.IO
 */
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});
registerSignalingHandlers(io);

/**
 * 1) GLOBAL MIDDLEWARE
 */
app.use(
  cors({
    origin: CORS_ORIGINS,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
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
app.use("/api/admin", adminRouter);
app.use("/api/tickets", ticketRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/video-consultations", videoConsultationRouter);
app.use("/api/chatbot", chatbotRouter);

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

  await startVideoReminderScheduler(); // ⏰ 5-min-before video call reminders
  startSlaEnforcer(); // ⏰ SLA breach detection every 5 min

  httpServer.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO attached and listening`);
  });
}

bootstrap().catch((err) => {
  console.error("❌ Boot failed:", err.message);
  process.exit(1);
});
