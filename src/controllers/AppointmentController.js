import AppointmentService from "../services/appointmentService.js";

/* ----------------------------- helpers ----------------------------- */
const normalizeStr = (v) => String(v ?? "").trim();
const normalizeEmail = (v) => normalizeStr(v).toLowerCase();

const resolveUserId = (req) => req.user?._id || req.user?.id || null;

const resolveTenantIdForPatient = (req) =>
  req.query?.tenantId || req.body?.tenantId || null;

const resolveFeeNumber = (raw) => {
  const n = Number(raw?.consultationFee ?? raw?.fee ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Accept two input shapes:
 *  A) date + slot  (recommended)
 *  B) dateTime ISO (optional)
 *
 * If dateTime is given, we convert it to { date, slot } for service compatibility.
 */
const resolveDateSlot = (raw) => {
  // preferred
  if (raw?.date && raw?.slot) {
    return { date: normalizeStr(raw.date), slot: normalizeStr(raw.slot) };
  }

  const dt = raw?.dateTime || raw?.datetime || null;
  if (!dt) return { date: "", slot: "" };

  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return { date: "", slot: "" };

  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const slot = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return { date, slot };
};

const buildPatientInfoSnapshot = (raw = {}) => {
  const incoming =
    raw.patientInfo && typeof raw.patientInfo === "object"
      ? raw.patientInfo
      : null;

  const snapshot = incoming
    ? {
        name: normalizeStr(incoming.name),
        email: normalizeEmail(incoming.email),
        contact: normalizeStr(incoming.contact || incoming.phone),
        symptoms: normalizeStr(incoming.symptoms),
      }
    : {
        name: normalizeStr(raw.patientName || raw.name),
        email: normalizeEmail(raw.patientEmail || raw.email),
        contact: normalizeStr(raw.patientContact || raw.contact || raw.phone),
        symptoms: normalizeStr(raw.symptoms || raw.notes),
      };

  if (!snapshot.name) {
    return { error: "Patient name is required." };
  }
  if (!snapshot.contact) {
    return { error: "Patient contact is required." };
  }

  return { snapshot };
};

/* ----------------------------- controller ----------------------------- */
class AppointmentController {
  /**
   * Create appointment (patient-side booking)
   * POST /api/appointments
   *
   * Auth required (PATIENT token)
   * tenantId:
   *  - If token includes tenantId (admin booking), use it
   *  - Else patient must pass tenantId in body/query
   */
  create = async (req, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User session not found. Please login again.",
        });
      }

      const role = String(req.user?.role || "").toUpperCase();

      // tenant context rules
      const tokenTenantId = req.user?.tenantId || null;
      const fallbackTenantId = resolveTenantIdForPatient(req);

      // Admin must have token tenantId
      if (role === "CLINIC_ADMIN" && !tokenTenantId) {
        return res.status(403).json({
          success: false,
          message: "Tenant context missing in admin token.",
        });
      }

      const tenantId = tokenTenantId || fallbackTenantId;
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: "Medical Facility (tenantId) is required.",
        });
      }

      const raw = req.body || {};

      // patient snapshot
      const { snapshot, error: patientInfoError } = buildPatientInfoSnapshot(raw);
      if (patientInfoError) {
        return res.status(400).json({
          success: false,
          message: patientInfoError,
        });
      }

      // doctor id
      const doctorId = raw.doctorId || raw.doctor;
      if (!doctorId) {
        return res.status(400).json({
          success: false,
          message: "doctorId is required.",
        });
      }

      // date + slot
      const { date, slot } = resolveDateSlot(raw);
      if (!date || !slot) {
        return res.status(400).json({
          success: false,
          message: "date+slot (or valid dateTime) is required.",
        });
      }

      // Build service payload (IMPORTANT: patientId from token ONLY)
      const appointmentData = {
        doctorId,
        date,
        slot,
        consultationFee: resolveFeeNumber(raw),
        patientId: userId,
        patientInfo: snapshot,
      };

      const appointment = await AppointmentService.createAppointment(
        tenantId,
        appointmentData
      );

      return res.status(201).json({
        success: true,
        message: "Appointment created successfully.",
        data: appointment,
      });
    } catch (error) {
      console.error("Controller Error (create):", error);

      // Common business errors -> 400
      return res.status(400).json({
        success: false,
        message: error?.message || "Appointment creation failed.",
      });
    }
  };

  /**
   * Admin view: all tenant appointments
   * GET /api/appointments
   */
  getAll = async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");

      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: "Tenant context missing in token.",
        });
      }

      const appointments = await AppointmentService.getTenantAppointments(tenantId);

      return res.status(200).json({
        success: true,
        count: appointments.length,
        data: appointments,
      });
    } catch (error) {
      console.error("Controller Error (getAll):", error);
      return res.status(500).json({
        success: false,
        message: error?.message || "Failed to retrieve tenant appointments.",
      });
    }
  };

  /**
   * My appointments:
   * - CLINIC_ADMIN => tenant appointments (token tenantId required)
   * - PATIENT => own appointments (tenantId from query/body allowed if token has none)
   *
   * GET /api/appointments/my-appointments?tenantId=...
   */
  getMyAppointments = async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");

      const userId = resolveUserId(req);
      const role = String(req.user?.role || "").toUpperCase();

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User session not found.",
        });
      }

      const isAdmin = role === "CLINIC_ADMIN";
      const tokenTenantId = req.user?.tenantId || null;
      const fallbackTenantId = resolveTenantIdForPatient(req);
      const tenantId = isAdmin ? tokenTenantId : (tokenTenantId || fallbackTenantId);

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: isAdmin
            ? "Tenant context missing in token."
            : "tenantId missing. Pass it in query (?tenantId=...) or body.",
        });
      }

      const appointments = isAdmin
        ? await AppointmentService.getTenantAppointments(tenantId)
        : await AppointmentService.getPatientAppointments(tenantId, userId);

      return res.status(200).json({
        success: true,
        data: appointments,
      });
    } catch (error) {
      console.error("Controller Error (getMyAppointments):", error);
      return res.status(500).json({
        success: false,
        message: error?.message || "Failed to retrieve appointments.",
      });
    }
  };

  /**
   * Update status (tenant secured)
   * PATCH /api/appointments/:id/status
   */
  updateStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: "Tenant context missing in token.",
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Appointment ID is required.",
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: "Status is required.",
        });
      }

      const updatedAppointment = await AppointmentService.updateStatus(
        tenantId,
        id,
        status
      );

      return res.status(200).json({
        success: true,
        message: `Status updated to ${String(status).toUpperCase()}.`,
        data: updatedAppointment,
      });
    } catch (error) {
      console.error("Controller Error (updateStatus):", error);
      return res.status(400).json({
        success: false,
        message: error?.message || "Status update failed.",
      });
    }
  };
}

export default new AppointmentController();
