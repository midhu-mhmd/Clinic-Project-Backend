import Appointment from "../models/appointmentModel.js";
import Doctor from "../models/doctorModel.js";
import mongoose from "mongoose";

class AppointmentService {
  /**
   * Create a new appointment with validation
   * Handles multi-tenant validation and prevents double booking
   */
  async createAppointment(tenantId, appointmentData) {
    const {
      doctorId,
      patientId,
      date,
      slot,
      fee, // can be string/number from UI
    } = appointmentData;

    // --- 1) VALIDATION + TYPE NORMALIZATION ---
    if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
      throw new Error("Invalid facility (tenant) context.");
    }
    if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
      throw new Error("Invalid faculty identifier.");
    }
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      throw new Error("Patient identifier is missing/invalid. Re-authentication required.");
    }
    if (!date || !slot) {
      throw new Error("Date and slot are required.");
    }

    const tId = new mongoose.Types.ObjectId(tenantId);
    const dId = new mongoose.Types.ObjectId(doctorId);
    const pId = new mongoose.Types.ObjectId(patientId);

    // --- 2) VERIFY DOCTOR + TENANT CONTEXT ---
    const doctor = await Doctor.findById(dId);
    if (!doctor) {
      throw new Error("Faculty member not found in the registry.");
    }

    if (doctor.tenantId?.toString() !== tId.toString()) {
      console.error(
        `Security/Data Mismatch: Doctor belongs to tenant ${doctor.tenantId} but request sent ${tId}`
      );
      throw new Error("Specified faculty member is not registered at this facility.");
    }

    // --- 3) BUILD DATETIME ---
    const appointmentDateTime = new Date(`${date}T${slot}:00`);
    if (Number.isNaN(appointmentDateTime.getTime())) {
      throw new Error("Invalid temporal format provided. Protocol initialization aborted.");
    }

    // --- 4) PREVENT DOUBLE BOOKING ---
    const existingAppointment = await Appointment.findOne({
      doctorId: dId,
      tenantId: tId,
      dateTime: appointmentDateTime,
      status: { $in: ["PENDING", "CONFIRMED"] },
    });

    if (existingAppointment) {
      throw new Error("This temporal slot has already been synchronized with another protocol.");
    }

    // --- 5) FEE NORMALIZATION ---
    // Priority: explicit fee from request -> doctor.consultationFee -> doctor.fee -> 0
    let normalizedFee = 0;

    if (fee !== undefined && fee !== null && fee !== "") {
      const parsed = Number(fee);
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new Error("Invalid consultation fee.");
      }
      normalizedFee = parsed;
    } else {
      const fallback = doctor.consultationFee ?? doctor.fee ?? 0;
      normalizedFee = Number(fallback) || 0;
    }

    // --- 6) CREATE APPOINTMENT (Schema-aligned) ---
    const created = await Appointment.create({
      tenantId: tId,
      doctorId: dId,
      patientId: pId,
      dateTime: appointmentDateTime,
      consultationFee: normalizedFee, // ✅ added/confirmed
      status: "PENDING",
    });

    return created;
  }

  /**
   * Retrieves all records for a specific facility (Administrative View)
   */
  async getTenantAppointments(tenantId, filters = {}) {
    if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
      throw new Error("Invalid facility (tenant) context.");
    }

    const tId = new mongoose.Types.ObjectId(tenantId);

    return await Appointment.find({ tenantId: tId, ...filters })
      .populate("doctorId", "name specialization consultationFee")
      .populate("patientId", "name email")
      .sort({ dateTime: 1 });
  }

  /**
   * Retrieves appointments for the authenticated user/patient
   */
  async getPatientAppointments(tenantId, patientId) {
    if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
      throw new Error("Invalid facility (tenant) context.");
    }
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      throw new Error("Invalid patient context.");
    }

    const tId = new mongoose.Types.ObjectId(tenantId);
    const pId = new mongoose.Types.ObjectId(patientId);

    return await Appointment.find({
      tenantId: tId,
      patientId: pId,
    })
      .populate("doctorId", "name specialization image")
      .sort({ dateTime: -1 });
  }

  /**
   * Updates status with protocol validation
   */
  async updateStatus(tenantId, appointmentId, status) {
    const validStatuses = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"];
    const normalizedStatus = (status || "").toUpperCase();

    if (!validStatuses.includes(normalizedStatus)) {
      throw new Error("Invalid protocol status update requested.");
    }

    if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
      throw new Error("Invalid facility (tenant) context.");
    }
    if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) {
      throw new Error("Invalid protocol record identifier.");
    }

    const tId = new mongoose.Types.ObjectId(tenantId);

    const appointment = await Appointment.findOneAndUpdate(
      { _id: appointmentId, tenantId: tId },
      { status: normalizedStatus },
      { new: true }
    );

    if (!appointment) {
      throw new Error("Protocol record not found in this facility's registry.");
    }

    return appointment;
  }

  /**
   * Protocol Deactivation (Soft Delete/Cancellation)
   */
  async cancelAppointment(tenantId, appointmentId) {
    if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
      throw new Error("Invalid facility (tenant) context.");
    }
    if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) {
      throw new Error("Invalid protocol record identifier.");
    }

    const tId = new mongoose.Types.ObjectId(tenantId);

    return await Appointment.findOneAndUpdate(
      { _id: appointmentId, tenantId: tId },
      { status: "CANCELLED" },
      { new: true }
    );
  }
}

export default new AppointmentService();