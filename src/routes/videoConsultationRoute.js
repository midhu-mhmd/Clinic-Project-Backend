import express from "express";
import VideoConsultationController from "../controllers/videoConsultationController.js";
import { protect, restrictTo } from "../middlewares/authMiddleware.js";

const videoConsultationRouter = express.Router();

// All routes require auth
videoConsultationRouter.use(protect);

// ─── Static routes first ───
videoConsultationRouter.get(
  "/tenant",
  restrictTo("CLINIC_ADMIN"),
  VideoConsultationController.getTenantConsultations
);

videoConsultationRouter.get(
  "/my",
  restrictTo("PATIENT"),
  VideoConsultationController.getMyConsultations
);

// ─── Session management ───
videoConsultationRouter.post("/verify-token", VideoConsultationController.verifyToken);
videoConsultationRouter.post("/session", VideoConsultationController.getOrCreateSession);
videoConsultationRouter.post("/join", VideoConsultationController.recordJoin);
videoConsultationRouter.post("/end", VideoConsultationController.endSession);

// ─── Dynamic routes ───
videoConsultationRouter.get("/room/:roomId", VideoConsultationController.getByRoomId);
videoConsultationRouter.patch("/:id/notes", restrictTo("CLINIC_ADMIN"), VideoConsultationController.addNotes);

export default videoConsultationRouter;
