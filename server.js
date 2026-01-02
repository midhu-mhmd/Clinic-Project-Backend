import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import connectDB from "./src/config/db.js";
import router from "./src/routes/userRoute.js";

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

app.get("/test-email", async (req, res) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "your_email@gmail.com",
      subject: "Test Email",
      text: "This is a test email",
    });
    res.send("Email sent: " + info.messageId);
  } catch (err) {
    console.log(err);
    res.status(500).send(err.message);
  }
});

app.use("/api/users", router);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`server is running on http://localhost:${PORT}`);
});
