import VideoConsultation from "../models/videoConsultationModel.js";
import Appointment from "../models/appointmentModel.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

class VideoConsultationService {
  #isValidObjectId(id) {
    return Boolean(id) && mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Get or create a video consultation session from an appointment
   */
  async getOrCreateSession(appointmentId) {
    if (!this.#isValidObjectId(appointmentId)) throw new Error("Invalid appointment ID.");

    // Check if session already exists
    let session = await VideoConsultation.findOne({ appointmentId })
      .populate("doctorId", "name specialization image")
      .populate("patientId", "name email image")
      .lean();

    if (session) return session;

    // Find the appointment
    const appointment = await Appointment.findById(appointmentId).lean();
    if (!appointment) throw new Error("Appointment not found.");
    if (appointment.consultationType !== "video") {
      throw new Error("This is not a video consultation appointment.");
    }

    // Extract roomId from meeting link
    const roomId = appointment.meetingLink
      ? appointment.meetingLink.split("/consultation/")[1] || ""
      : "";

    if (!roomId) throw new Error("No meeting room found for this appointment.");

    session = await VideoConsultation.create({
      appointmentId,
      roomId,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      tenantId: appointment.tenantId,
    });

    return VideoConsultation.findById(session._id)
      .populate("doctorId", "name specialization image")
      .populate("patientId", "name email image")
      .lean();
  }

  /**
   * Get session by room ID (used when joining via link)
   */
  async getSessionByRoomId(roomId) {
    if (!roomId) throw new Error("Room ID is required.");

    const session = await VideoConsultation.findOne({ roomId })
      .populate("doctorId", "name specialization image")
      .populate("patientId", "name email image")
      .populate("appointmentId", "dateTime consultationType status patientInfo")
      .lean();

    if (!session) throw new Error("Consultation session not found.");
    return session;
  }

  /**
   * Record participant join
   */
  async recordJoin(roomId, userId, role) {
    if (!roomId) throw new Error("Room ID is required.");

    const update = {};
    if (role === "DOCTOR" || role === "CLINIC_ADMIN") {
      update.doctorJoinedAt = new Date();
    } else {
      update.patientJoinedAt = new Date();
    }

    // If both haven't joined yet and this is first join, mark as in-progress
    const session = await VideoConsultation.findOne({ roomId });
    if (!session) throw new Error("Session not found.");

    if (session.status === "WAITING") {
      const otherJoined = role === "DOCTOR" || role === "CLINIC_ADMIN"
        ? session.patientJoinedAt
        : session.doctorJoinedAt;

      if (otherJoined) {
        update.status = "IN_PROGRESS";
        update.startedAt = new Date();
      }
    }

    return VideoConsultation.findOneAndUpdate({ roomId }, update, { new: true }).lean();
  }

  /**
   * End consultation session
   */
  async endSession(roomId, { doctorNotes, prescription } = {}) {
    if (!roomId) throw new Error("Room ID is required.");

    const session = await VideoConsultation.findOne({ roomId });
    if (!session) throw new Error("Session not found.");

    const now = new Date();
    const startedAt = session.startedAt || session.createdAt;
    const duration = Math.round((now - startedAt) / 1000);

    const update = {
      status: "COMPLETED",
      endedAt: now,
      duration,
    };
    if (doctorNotes) update.doctorNotes = doctorNotes.trim();
    if (prescription) update.prescription = prescription.trim();

    // Also update the appointment status
    await Appointment.findByIdAndUpdate(session.appointmentId, { status: "COMPLETED" });

    return VideoConsultation.findOneAndUpdate({ roomId }, update, { new: true }).lean();
  }

  /**
   * Add doctor notes / prescription after session
   */
  async addNotes(sessionId, { doctorNotes, prescription }) {
    if (!this.#isValidObjectId(sessionId)) throw new Error("Invalid session ID.");

    const update = {};
    if (doctorNotes !== undefined) update.doctorNotes = doctorNotes.trim();
    if (prescription !== undefined) update.prescription = prescription.trim();

    const session = await VideoConsultation.findByIdAndUpdate(sessionId, update, { new: true }).lean();
    if (!session) throw new Error("Session not found.");
    return session;
  }

  /**
   * Get consultation history for a tenant (clinic dashboard)
   */
  async getTenantConsultations(tenantId, { page = 1, limit = 20, status } = {}) {
    if (!this.#isValidObjectId(tenantId)) throw new Error("Invalid tenant ID.");

    const query = { tenantId };
    if (status) query.status = status.toUpperCase();

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [consultations, total] = await Promise.all([
      VideoConsultation.find(query)
        .populate("doctorId", "name specialization image")
        .populate("patientId", "name email image")
        .populate("appointmentId", "dateTime patientInfo consultationFee")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      VideoConsultation.countDocuments(query),
    ]);

    return {
      consultations,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get patient's consultation history
   */
  async getPatientConsultations(patientId, { page = 1, limit = 20 } = {}) {
    if (!this.#isValidObjectId(patientId)) throw new Error("Invalid patient ID.");

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [consultations, total] = await Promise.all([
      VideoConsultation.find({ patientId })
        .populate("doctorId", "name specialization image")
        .populate("tenantId", "name")
        .populate("appointmentId", "dateTime patientInfo consultationFee")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      VideoConsultation.countDocuments({ patientId }),
    ]);

    return {
      consultations,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Verify JWT meeting token and authorize user to join
   * Returns session data if token valid + user authorized
   */
  async verifyMeetingToken(meetingToken, userId, userRole) {
    if (!meetingToken) throw new Error("Meeting token is required.");
    if (!userId) throw new Error("Authentication required.");

    let decoded;
    try {
      decoded = jwt.verify(meetingToken, process.env.JWT_SECRET);
    } catch (err) {
      const msg = err?.message?.includes("expired")
        ? "Meeting link has expired."
        : "Invalid meeting link.";
      throw new Error(msg);
    }

    if (decoded.purpose !== "VIDEO_CONSULTATION") {
      throw new Error("Invalid meeting token purpose.");
    }

    const { roomId, appointmentId } = decoded;
    if (!roomId) throw new Error("Invalid meeting token data.");

    // Find the consultation session
    const session = await VideoConsultation.findOne({ roomId })
      .populate("doctorId", "name specialization image")
      .populate("patientId", "name email image")
      .populate("appointmentId", "dateTime consultationType status patientInfo consultationFee")
      .lean();

    if (!session) throw new Error("Consultation session not found.");

    // Authorization: verify user is the doctor or patient
    const isDoctor =
      String(session.doctorId?._id || session.doctorId) === String(userId);
    const isPatient =
      String(session.patientId?._id || session.patientId) === String(userId);
    const isClinicAdmin =
      userRole === "CLINIC_ADMIN" &&
      String(session.tenantId) === String(userId); // if admin token has tenantId matching

    if (!isDoctor && !isPatient && userRole !== "CLINIC_ADMIN") {
      throw new Error("You are not authorized to join this consultation.");
    }

    // Check consultation status
    if (["COMPLETED", "CANCELLED"].includes(session.status)) {
      throw new Error(`This consultation has already been ${session.status.toLowerCase()}.`);
    }

    return {
      session,
      roomId,
      role: isDoctor || userRole === "CLINIC_ADMIN" ? "DOCTOR" : "PATIENT",
    };
  }
}

export default new VideoConsultationService();
