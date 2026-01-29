import AppointmentService from "../services/appointmentService.js";

class AppointmentController {
  /**
   * Initializes and persists a new appointment / protocol session.
   */
  create = async (req, res) => {
    try {
      // 1) Identify tenant context
      const tenantId = req.body.tenantId || req.user?.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: "Medical Facility (Tenant) context is missing.",
        });
      }

      // 2) Inject authenticated user as patientId (for patient-side booking)
      // NOTE: If clinic admin creates appointments for other patients,
      // you should pass patientId explicitly from body and validate role.
      const appointmentData = {
        ...req.body,
        patientId: req.user?._id,
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
      console.error("Controller Error (create):", error.message);
      return res.status(400).json({
        success: false,
        message: error.message || "Protocol initialization failed.",
      });
    }
  };

  /**
   * Retrieves all records for the facility (Administrative/Faculty View).
   */
  getAll = async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");

      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: "Tenant context missing.",
        });
      }

      const appointments = await AppointmentService.getTenantAppointments(tenantId);

      return res.status(200).json({
        success: true,
        count: appointments.length,
        data: appointments,
      });
    } catch (error) {
      console.error("Controller Error (getAll):", error.message);
      return res.status(500).json({
        success: false,
        message: error.message || "Registry synchronization error.",
      });
    }
  };

  /**
   * Retrieves appointments for the logged-in user.
   * - CLINIC_ADMIN => all tenant appointments
   * - others (PATIENT) => only their own
   */
  getMyAppointments = async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");

      const tenantId = req.user?.tenantId || req.body?.tenantId;
      const userId = req.user?._id;
      const role = req.user?.role;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: "Tenant context missing.",
        });
      }

      let appointments = [];

      if (role === "CLINIC_ADMIN") {
        appointments = await AppointmentService.getTenantAppointments(tenantId);
      } else {
        if (!userId) {
          return res.status(401).json({
            success: false,
            message: "User session not found.",
          });
        }
        appointments = await AppointmentService.getPatientAppointments(tenantId, userId);
      }

      return res.status(200).json({
        success: true,
        data: appointments,
      });
    } catch (error) {
      console.error("Controller Error (getMyAppointments):", error.message);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve appointments.",
      });
    }
  };

  /**
   * Updates the lifecycle state of a protocol (Confirm/Cancel/Complete).
   */
  updateStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: "Tenant context missing.",
        });
      }

      if (!id || !status) {
        return res.status(400).json({
          success: false,
          message: "Protocol ID and Status are required for transition.",
        });
      }

      const updatedAppointment = await AppointmentService.updateStatus(
        tenantId,
        id,
        status
      );

      return res.status(200).json({
        success: true,
        message: `Protocol transitioned to ${String(status).toUpperCase()}.`,
        data: updatedAppointment,
      });
    } catch (error) {
      console.error("Controller Error (updateStatus):", error.message);
      return res.status(400).json({
        success: false,
        message: error.message || "Status transition failed.",
      });
    }
  };
}

export default new AppointmentController();