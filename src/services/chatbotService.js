import ChatSession from "../models/chatSessionModel.js";
import mongoose from "mongoose";

/* =========================================================
   Symptom knowledge base for rule-based triage
========================================================= */
const SYMPTOM_DB = {
  headache: {
    severity: "mild",
    advice: "Rest in a quiet, dark room. Stay hydrated and consider over-the-counter pain relief. If headaches persist for more than 3 days or are unusually severe, consult a doctor.",
    specialization: "Neurologist",
    followUp: ["How long have you had this headache?", "Is it accompanied by nausea or sensitivity to light?"],
  },
  fever: {
    severity: "moderate",
    advice: "Stay hydrated, rest, and monitor your temperature. Take paracetamol if temperature exceeds 100.4°F (38°C). Seek immediate care if fever exceeds 103°F or lasts more than 3 days.",
    specialization: "General Physician",
    followUp: ["What is your current temperature?", "Do you have any other symptoms like cough or body aches?"],
  },
  cough: {
    severity: "mild",
    advice: "Stay hydrated, use honey in warm water, and avoid irritants. If cough persists beyond 2 weeks, is producing blood, or is accompanied by difficulty breathing, see a doctor immediately.",
    specialization: "Pulmonologist",
    followUp: ["Is the cough dry or producing mucus?", "How long have you had this cough?"],
  },
  "chest pain": {
    severity: "severe",
    advice: "⚠️ Chest pain can be a sign of a serious condition. If you experience sudden, severe chest pain with shortness of breath, call emergency services immediately. Do not wait.",
    specialization: "Cardiologist",
    followUp: ["Is the pain sharp or dull?", "Does it worsen with breathing or physical activity?"],
  },
  "breathing difficulty": {
    severity: "severe",
    advice: "⚠️ Difficulty breathing requires immediate attention. Sit upright, stay calm, and call emergency services if symptoms are severe. If you have an inhaler, use it.",
    specialization: "Pulmonologist",
    followUp: ["Did this start suddenly?", "Do you have a history of asthma or respiratory conditions?"],
  },
  "stomach pain": {
    severity: "moderate",
    advice: "Avoid spicy or heavy foods. Try a bland diet and stay hydrated. If pain is severe, persistent, or accompanied by vomiting blood or high fever, seek medical care.",
    specialization: "Gastroenterologist",
    followUp: ["Where exactly is the pain located?", "Is it constant or does it come and go?"],
  },
  nausea: {
    severity: "mild",
    advice: "Sip clear fluids slowly. Avoid strong odors and heavy meals. Ginger tea can help. See a doctor if vomiting persists for more than 24 hours or you cannot keep fluids down.",
    specialization: "General Physician",
    followUp: ["Have you eaten anything unusual recently?", "Is it accompanied by dizziness or fever?"],
  },
  dizziness: {
    severity: "moderate",
    advice: "Sit or lie down immediately. Stay hydrated. Avoid sudden movements. If dizziness is frequent, severe, or accompanied by fainting, see a doctor.",
    specialization: "Neurologist",
    followUp: ["Does the room seem to spin?", "Have you had any recent head injuries?"],
  },
  rash: {
    severity: "mild",
    advice: "Avoid scratching. Apply a cool compress and use fragrance-free moisturizer. If the rash spreads rapidly, is painful, or is accompanied by fever, consult a dermatologist.",
    specialization: "Dermatologist",
    followUp: ["When did the rash first appear?", "Have you used any new products or medications recently?"],
  },
  "back pain": {
    severity: "moderate",
    advice: "Apply ice for the first 48 hours, then switch to heat. Gentle stretching may help. Avoid heavy lifting. If pain radiates down your legs or is accompanied by numbness, see a doctor.",
    specialization: "Orthopedist",
    followUp: ["Did it start after a specific activity?", "Is the pain in the upper or lower back?"],
  },
  insomnia: {
    severity: "mild",
    advice: "Maintain a consistent sleep schedule. Avoid screens 1 hour before bed. Limit caffeine after noon. If sleep problems persist beyond 2 weeks, consider consulting a sleep specialist.",
    specialization: "General Physician",
    followUp: ["How long have you had trouble sleeping?", "Do you feel anxious or stressed at bedtime?"],
  },
  anxiety: {
    severity: "moderate",
    advice: "Practice deep breathing exercises: breathe in for 4 counts, hold for 4, exhale for 6. Ground yourself by naming 5 things you can see. If anxiety is affecting daily life, speak with a mental health professional.",
    specialization: "Psychiatrist",
    followUp: ["Is the anxiety constant or triggered by specific situations?", "Are you experiencing any physical symptoms like heart racing?"],
  },
  "joint pain": {
    severity: "moderate",
    advice: "Rest the affected joint. Apply ice for 15-20 minutes several times a day. Over-the-counter anti-inflammatory medication may help. See a doctor if the joint is red, swollen, or warm.",
    specialization: "Orthopedist",
    followUp: ["Which joint is affected?", "Does the pain worsen in the morning?"],
  },
  "sore throat": {
    severity: "mild",
    advice: "Gargle with warm salt water, stay hydrated, and rest your voice. Lozenges may provide relief. See a doctor if it persists beyond 5 days or is accompanied by high fever.",
    specialization: "ENT Specialist",
    followUp: ["Do you have difficulty swallowing?", "Are your tonsils swollen or has there been any white patches?"],
  },
  "eye pain": {
    severity: "moderate",
    advice: "Avoid rubbing your eyes. Rinse with clean water if there's irritation. If accompanied by vision changes, redness, or discharge, see an ophthalmologist promptly.",
    specialization: "Ophthalmologist",
    followUp: ["Is your vision affected?", "Is there any discharge or redness?"],
  },
};

const GREETING_PATTERNS = /^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy|greetings)/i;
const THANKS_PATTERNS = /^(thanks?|thank\s*you|thx|appreciate)/i;

class ChatbotService {
  #isValidObjectId(id) {
    return Boolean(id) && mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Detect symptoms from user message
   */
  #detectSymptoms(message) {
    const lowerMsg = message.toLowerCase();
    const detected = [];

    for (const [symptom, data] of Object.entries(SYMPTOM_DB)) {
      // Check for exact or partial match
      if (lowerMsg.includes(symptom)) {
        detected.push({ symptom, ...data });
      }
    }

    return detected;
  }

  /**
   * Generate response based on detected symptoms
   */
  #generateResponse(message, detectedSymptoms, sessionContext) {
    // Handle greetings
    if (GREETING_PATTERNS.test(message.trim())) {
      return {
        content: "Hello! I'm your AI health assistant. I can help you understand your symptoms and guide you to the right specialist. Please describe what you're experiencing, and I'll do my best to help.\n\n💡 You can tell me about symptoms like headache, fever, cough, chest pain, or anything else you're feeling.",
        symptoms: [],
        severity: null,
      };
    }

    // Handle thanks
    if (THANKS_PATTERNS.test(message.trim())) {
      return {
        content: "You're welcome! Remember, this is general guidance only — always consult a qualified healthcare professional for proper diagnosis and treatment. Take care! 🩺",
        symptoms: sessionContext.symptoms || [],
        severity: sessionContext.severity,
      };
    }

    // No symptoms detected
    if (detectedSymptoms.length === 0) {
      return {
        content: "I understand you're concerned about your health. Could you describe your symptoms in more detail? For example:\n\n• What part of your body is affected?\n• How long have you been experiencing this?\n• Is the discomfort mild, moderate, or severe?\n\nThe more details you provide, the better I can assist you.",
        symptoms: sessionContext.symptoms || [],
        severity: sessionContext.severity,
      };
    }

    // Determine overall severity
    const severityOrder = { mild: 1, moderate: 2, severe: 3 };
    const maxSeverity = detectedSymptoms.reduce(
      (max, s) => (severityOrder[s.severity] > severityOrder[max] ? s.severity : max),
      "mild"
    );

    // Build response
    const allSymptoms = [
      ...(sessionContext.symptoms || []),
      ...detectedSymptoms.map((s) => s.symptom),
    ];
    const uniqueSymptoms = [...new Set(allSymptoms)];

    let response = "";

    // Severe warning
    if (maxSeverity === "severe") {
      response += "🚨 **Important:** Some of your symptoms may require urgent medical attention.\n\n";
    }

    // Symptom analysis
    response += `Based on what you've described, here's my analysis:\n\n`;

    for (const s of detectedSymptoms) {
      const icon = s.severity === "severe" ? "🔴" : s.severity === "moderate" ? "🟡" : "🟢";
      response += `${icon} **${s.symptom.charAt(0).toUpperCase() + s.symptom.slice(1)}** (${s.severity})\n`;
      response += `${s.advice}\n\n`;
    }

    // Recommend specialists
    const specialists = [...new Set(detectedSymptoms.map((s) => s.specialization))];
    response += `**Recommended Specialist${specialists.length > 1 ? "s" : ""}:** ${specialists.join(", ")}\n\n`;

    // Follow-up questions
    const followUps = detectedSymptoms.flatMap((s) => s.followUp).slice(0, 3);
    if (followUps.length > 0) {
      response += `To better understand your condition, could you tell me:\n`;
      followUps.forEach((q, i) => {
        response += `${i + 1}. ${q}\n`;
      });
    }

    response += `\n⚕️ *This is AI-generated guidance, not a medical diagnosis. Please consult a healthcare professional for proper evaluation.*`;

    return {
      content: response,
      symptoms: uniqueSymptoms,
      severity: maxSeverity,
    };
  }

  /**
   * Create a new chat session
   */
  async createSession(userId) {
    if (!this.#isValidObjectId(userId)) throw new Error("Invalid user.");

    const session = await ChatSession.create({
      userId,
      messages: [
        {
          role: "assistant",
          content: "Hello! I'm your AI health assistant powered by Sovereign HealthBook. I can help you:\n\n• Understand your symptoms\n• Suggest the right specialist to visit\n• Provide general health guidance\n\nPlease describe what you're experiencing, and I'll do my best to help. Remember, this is not a substitute for professional medical advice.",
        },
      ],
    });

    return session;
  }

  /**
   * Send a message and get AI response
   */
  async sendMessage(sessionId, userId, message) {
    if (!this.#isValidObjectId(sessionId)) throw new Error("Invalid session ID.");
    if (!message?.trim()) throw new Error("Message cannot be empty.");

    const session = await ChatSession.findOne({ _id: sessionId, userId });
    if (!session) throw new Error("Chat session not found.");

    // Add user message
    session.messages.push({ role: "user", content: message.trim() });

    // Detect symptoms and generate response
    const detected = this.#detectSymptoms(message);
    const response = this.#generateResponse(message, detected, session.context || {});

    // Update session context
    if (response.symptoms.length > 0) {
      session.context.symptoms = response.symptoms;
    }
    if (response.severity) {
      session.context.severity = response.severity;
    }

    // Add assistant response
    session.messages.push({ role: "assistant", content: response.content });

    // Auto-set title from first real user message
    if (session.title === "New Chat" && detected.length > 0) {
      session.title = detected
        .map((s) => s.symptom.charAt(0).toUpperCase() + s.symptom.slice(1))
        .join(", ");
    }

    await session.save();

    return {
      sessionId: session._id,
      userMessage: { role: "user", content: message.trim() },
      assistantMessage: { role: "assistant", content: response.content },
      context: session.context,
    };
  }

  /**
   * Get all chat sessions for a user
   */
  async getUserSessions(userId) {
    if (!this.#isValidObjectId(userId)) throw new Error("Invalid user.");

    return ChatSession.find({ userId, isActive: true })
      .select("title context.severity createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
  }

  /**
   * Get a specific session with messages
   */
  async getSession(sessionId, userId) {
    if (!this.#isValidObjectId(sessionId)) throw new Error("Invalid session ID.");

    const session = await ChatSession.findOne({ _id: sessionId, userId }).lean();
    if (!session) throw new Error("Chat session not found.");
    return session;
  }

  /**
   * Delete (soft) a session
   */
  async deleteSession(sessionId, userId) {
    if (!this.#isValidObjectId(sessionId)) throw new Error("Invalid session ID.");

    const session = await ChatSession.findOneAndUpdate(
      { _id: sessionId, userId },
      { isActive: false },
      { new: true }
    );
    if (!session) throw new Error("Chat session not found.");
    return { deleted: true };
  }
}

export default new ChatbotService();
