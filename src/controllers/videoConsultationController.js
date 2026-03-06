import VideoConsultationService from "../services/videoConsultationService.js";

const resolveUserId = (req) => req.user?._id || req.user?.id || null;
const resolveRole = (req) => String(req.user?.role || "").toUpperCase();

class VideoConsultationController {
  /**
   * POST /api/video-consultations/session — Get or create session from appointment
   */
  getOrCreateSession = async (req, res) => {
    try {
      const { appointmentId } = req.body;
      if (!appointmentId) {
        return res.status(400).json({ success: false, message: "appointmentId is required." });
      }

      const session = await VideoConsultationService.getOrCreateSession(appointmentId);

      return res.status(200).json({ success: true, data: session });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to create session.",
      });
    }
  };

  /**
   * GET /api/video-consultations/room/:roomId — Get session by room ID
   */
  getByRoomId = async (req, res) => {
    try {
      const session = await VideoConsultationService.getSessionByRoomId(req.params.roomId);
      return res.status(200).json({ success: true, data: session });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Session not found.",
      });
    }
  };

  /**
   * POST /api/video-consultations/join — Record participant joining
   */
  recordJoin = async (req, res) => {
    try {
      const { roomId } = req.body;
      const userId = resolveUserId(req);
      const role = resolveRole(req);

      const session = await VideoConsultationService.recordJoin(roomId, userId, role);
      return res.status(200).json({ success: true, data: session });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to record join.",
      });
    }
  };

  /**
   * POST /api/video-consultations/end — End a consultation
   */
  endSession = async (req, res) => {
    try {
      const { roomId, doctorNotes, prescription } = req.body;

      const session = await VideoConsultationService.endSession(roomId, {
        doctorNotes,
        prescription,
      });

      return res.status(200).json({
        success: true,
        message: "Consultation ended.",
        data: session,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to end session.",
      });
    }
  };

  /**
   * PATCH /api/video-consultations/:id/notes — Add notes after session
   */
  addNotes = async (req, res) => {
    try {
      const { doctorNotes, prescription } = req.body;
      const session = await VideoConsultationService.addNotes(req.params.id, {
        doctorNotes,
        prescription,
      });

      return res.status(200).json({ success: true, data: session });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to update notes.",
      });
    }
  };

  /**
   * GET /api/video-consultations/tenant — Clinic's consultation history
   */
  getTenantConsultations = async (req, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, message: "Tenant context missing." });
      }

      const { page, limit, status } = req.query;
      const result = await VideoConsultationService.getTenantConsultations(tenantId, {
        page,
        limit,
        status,
      });

      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch consultations.",
      });
    }
  };

  /**
   * GET /api/video-consultations/my — Patient's consultation history
   */
  getMyConsultations = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const { page, limit } = req.query;

      const result = await VideoConsultationService.getPatientConsultations(userId, {
        page,
        limit,
      });

      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch consultations.",
      });
    }
  };

  /**
   * POST /api/video-consultations/verify-token — Verify JWT meeting token & authorize user
   */
  verifyToken = async (req, res) => {
    try {
      const { meetingToken } = req.body;
      const userId = resolveUserId(req);
      const userRole = resolveRole(req);

      if (!meetingToken) {
        return res.status(400).json({ success: false, message: "Meeting token is required." });
      }

      const result = await VideoConsultationService.verifyMeetingToken(meetingToken, userId, userRole);

      // Also record the join
      await VideoConsultationService.recordJoin(result.roomId, userId, result.role);

      return res.status(200).json({
        success: true,
        data: {
          session: result.session,
          roomId: result.roomId,
          role: result.role,
        },
      });
    } catch (error) {
      const status = error?.message?.includes("not authorized") ? 403 : 400;
      return res.status(status).json({
        success: false,
        message: error?.message || "Token verification failed.",
      });
    }
  };
}

export default new VideoConsultationController();
