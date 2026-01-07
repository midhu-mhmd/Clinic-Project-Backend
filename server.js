import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import connectDB from "./src/config/db.js";
import router from "./src/routes/userRoute.js";
import tenantRoute from "./src/routes/tenantRoute.js";
import paymentRoute from "./src/routes/paymentRoute.js";

const app = express();
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
  })
);
app.use(express.json());

connectDB();


app.use("/api/users", router);
app.use("/api/tenants", tenantRoute);
app.use("/api/payments", paymentRoute);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`server is running on http://localhost:${PORT}`);
});
