import ChatbotService from "../services/chatbotService.js";

const resolveUserId = (req) => req.user?._id || req.user?.id || null;

class ChatbotController {
  /**
   * POST /api/chatbot/sessions — Start a new chat session
   */
  createSession = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const session = await ChatbotService.createSession(userId);

      return res.status(201).json({ success: true, session });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to create chat session.",
      });
    }
  };

  /**
   * GET /api/chatbot/sessions — Get all sessions for current user
   */
  getSessions = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const sessions = await ChatbotService.getUserSessions(userId);

      return res.status(200).json({ success: true, sessions });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch sessions.",
      });
    }
  };

  /**
   * GET /api/chatbot/sessions/:id — Get specific session with messages
   */
  getSession = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const session = await ChatbotService.getSession(req.params.id, userId);

      return res.status(200).json({ success: true, session });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to fetch session.",
      });
    }
  };

  /**
   * POST /api/chatbot/sessions/:id/message — Send a message
   */
  sendMessage = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const { message } = req.body;

      if (!message?.trim()) {
        return res.status(400).json({ success: false, message: "Message is required." });
      }

      const result = await ChatbotService.sendMessage(req.params.id, userId, message);

      return res.status(200).json({
        success: true,
        session: result.session,
        messages: result.messages,
        context: result.context,
        ragSources: result.ragSources,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to send message.",
      });
    }
  };

  /**
   * DELETE /api/chatbot/sessions/:id — Delete a session
   */
  deleteSession = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      await ChatbotService.deleteSession(req.params.id, userId);

      return res.status(200).json({ success: true, message: "Session deleted." });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error?.message || "Failed to delete session.",
      });
    }
  };
}

export default new ChatbotController();
