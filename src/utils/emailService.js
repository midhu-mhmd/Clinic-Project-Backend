import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/**
 * Configure the SMTP Transporter
 * These values should be stored in your .env file
 */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * ✅ Global Send Email Function
 * @param {Object} options - { to, subject, html }
 */
export const sendEmail = async (options) => {
  try {
    const mailOptions = {
      from: `"Sovereign Protocol" <${process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log(`[Email Service] Message sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("[Email Service] Critical Failure:", error.message);
    // We throw the error so the controller's try-catch can decide how to handle it
    throw new Error("Email dispatch failed.");
  }
};