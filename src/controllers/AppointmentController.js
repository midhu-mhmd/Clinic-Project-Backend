import AppointmentService from "../services/appointmentService.js";

const normalizeStr = (v) => String(v ?? "").trim();
const normalizeEmail = (v) => normalizeStr(v).toLowerCase();

const resolveUserId = (req) => req.user?._id || req.user?.id;

const resolveTenantIdForPatient = (req) =>
  req.query?.tenantId || req.body?.tenantId || null;

const resolveFee = (raw) => {
  const n = Number(raw?.fee ?? raw?.consultationFee ?? 0);
  return Number.isFinite(n) ? n : 0;
};

class AppointmentController {
  /**
   * Create appointment (patient-side booking).
   * - tenantId: req.user.tenantId preferred OR req.body/query fallback (patient flow)
   * - patientId: from authenticated user
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

      // Tenant context:
      // - If clinic admin token has tenantId, use it.
      // - If patient token doesn't have tenantId, allow body/query.
      const tokenTenantId = req.user?.tenantId || null;
      const fallbackTenantId = resolveTenantIdForPatient(req);
      const tenantId = tokenTenantId || fallbackTenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: "Medical Facility (Tenant) context is missing.",
        });
      }

      const raw = req.body || {};

      // Normalize patientInfo
      const incomingPatientInfo =
        raw.patientInfo && typeof raw.patientInfo === "object"
          ? raw.patientInfo
          : null;

      const normalizedPatientInfo = incomingPatientInfo
        ? {
            name: normalizeStr(incomingPatientInfo.name),
            email: normalizeEmail(incomingPatientInfo.email),
            contact: normalizeStr(
              incomingPatientInfo.contact || incomingPatientInfo.phone
            ),
            symptoms: normalizeStr(incomingPatientInfo.symptoms),
          }
        : {
            name: normalizeStr(raw.patientName || raw.name),
            email: normalizeEmail(raw.patientEmail || raw.email),
            contact: normalizeStr(raw.patientContact || raw.contact || raw.phone),
            symptoms: normalizeStr(raw.symptoms || raw.notes),
          };

      if (!normalizedPatientInfo.name) {
        return res.status(400).json({
          success: false,
          message: "Patient name is required.",
        });
      }
      if (!normalizedPatientInfo.contact) {
        return res.status(400).json({
          success: false,
          message: "Patient contact is required.",
        });
      }

      // Support both: dateTime OR (date + slot)
      const dateTime = raw.dateTime || raw.datetime || null;

      // ✅ Whitelist fields but keep compatibility
      const appointmentData = {
        doctorId: raw.doctorId || raw.doctor,
        dateTime,                 // preferred by many schemas
        date: raw.date,           // if your schema uses date/slot
        slot: raw.slot,
        consultationFee: resolveFee(raw), // standard name
        fee: resolveFee(raw),            // backward compatibility
        patientId: userId,
        patientInfo: normalizedPatientInfo,
        status: raw.status, // optional (service/model can default)
      };

      const appointment = await AppointmentService.createAppointment(
        tenantId,
        appointmentData
      );

      return res.status(201).json({
        success: true,
        message: "Protocol synchronized successfully.",
        data: appointment,
      });
    } catch (error) {
      console.error("Controller Error (create):", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Protocol initialization failed.",
      });
    }
  };

  /**
   * Admin view: all tenant appointments
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
        message: error.message || "Registry synchronization error.",
      });
    }
  };

  /**
   * My appointments:
   * - CLINIC_ADMIN => all tenant appointments (token tenantId required)
   * - PATIENT => own appointments (tenantId from query/body allowed)
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

      const isAdmin = role === "CLINIC_ADMIN"; // add STAFF here only if your schema supports it
      const tokenTenantId = req.user?.tenantId || null;
      const fallbackTenantId = resolveTenantIdForPatient(req);
      const tenantId = isAdmin ? tokenTenantId : (tokenTenantId || fallbackTenantId);

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: isAdmin
            ? "Tenant context missing in token."
            : "Tenant context missing. Pass tenantId in query (?tenantId=...).",
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
        message: error.message || "Failed to retrieve appointments.",
      });
    }
  };

  /**
   * Update status (tenant secured)
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

      if (!id || !status) {
        return res.status(400).json({
          success: false,
          message: "Appointment ID and status are required.",
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
        message: error.message || "Status transition failed.",
      });
    }
  };
}

export default new AppointmentController();
