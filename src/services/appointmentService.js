import Appointment from "../models/appointmentModel.js";
import Doctor from "../models/doctorModel.js";
import mongoose from "mongoose";

class AppointmentService {
  // ---------- helpers ----------
  #isValidObjectId(id) {
    return id && mongoose.Types.ObjectId.isValid(id);
  }

  #parseDateTime(dateStr, slotStr) {
    // dateStr: "YYYY-MM-DD"
    // slotStr: "HH:mm"
    if (!dateStr || !slotStr) return null;

    const [y, m, d] = String(dateStr).split("-").map(Number);
    const [hh, mm] = String(slotStr).split(":").map(Number);

    if (
      !y || !m || !d ||
      Number.isNaN(hh) || Number.isNaN(mm) ||
      hh < 0 || hh > 23 || mm < 0 || mm > 59
    ) {
      return null;
    }

    // Local time -> Date object
    // (If you want strict UTC, we can do Date.UTC here)
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    if (Number.isNaN(dt.getTime())) return null;

    return dt;
  }

  #normalizeFee(fee, doctor) {
    if (fee !== undefined && fee !== null && fee !== "") {
      const parsed = Number(fee);
      if (Number.isNaN(parsed) || parsed < 0) throw new Error("Invalid consultation fee.");
      return parsed;
    }
    const fallback = doctor.consultationFee ?? doctor.fee ?? 0;
    return Number(fallback) || 0;
  }

  #normalizePatientInfo(appointmentData) {
    const {
      patientInfo,
      patientName,
      patientEmail,
      patientContact,
      contact,
      symptoms,
      notes,
    } = appointmentData;

    const info = patientInfo && typeof patientInfo === "object" ? patientInfo : {};

    const name = String(info.name ?? patientName ?? "").trim();
    const email = String(info.email ?? patientEmail ?? "").trim().toLowerCase();
    const phone = String(info.contact ?? info.phone ?? patientContact ?? contact ?? "").trim();
    const sx = String(info.symptoms ?? symptoms ?? notes ?? "").trim();

    if (!name) throw new Error("Patient name is required.");
    if (!phone) throw new Error("Patient contact is required.");

    return { name, email, contact: phone, symptoms: sx };
  }

  /**
   * Create a new appointment:
   * - validates tenant/doctor/patient
   * - prevents double booking
   * - stores patient snapshot in patientInfo
   */
  async createAppointment(tenantId, appointmentData) {
    const { doctorId, patientId, date, slot, fee } = appointmentData;

    // --- 1) Validate IDs ---
    if (!this.#isValidObjectId(tenantId)) throw new Error("Invalid facility (tenant) context.");
    if (!this.#isValidObjectId(doctorId)) throw new Error("Invalid faculty identifier.");
    if (!this.#isValidObjectId(patientId))
      throw new Error("Patient identifier is missing/invalid. Re-authentication required.");

    // --- 2) Parse datetime safely ---
    const appointmentDateTime = this.#parseDateTime(date, slot);
    if (!appointmentDateTime) throw new Error("Invalid date/slot format.");

    const tId = new mongoose.Types.ObjectId(tenantId);
    const dId = new mongoose.Types.ObjectId(doctorId);
    const pId = new mongoose.Types.ObjectId(patientId);

    // --- 3) Verify doctor + tenant context ---
    const doctor = await Doctor.findById(dId).select("tenantId consultationFee fee");
    if (!doctor) throw new Error("Faculty member not found in the registry.");

    if (String(doctor.tenantId) !== String(tId)) {
      throw new Error("Specified faculty member is not registered at this facility.");
    }

    // --- 4) Prevent double booking ---
    const clash = await Appointment.exists({
      doctorId: dId,
      tenantId: tId,
      dateTime: appointmentDateTime,
      status: { $in: ["PENDING", "CONFIRMED"] },
    });

    if (clash) {
      throw new Error("This temporal slot has already been synchronized with another protocol.");
    }

    // --- 5) Normalize fee ---
    const normalizedFee = this.#normalizeFee(fee, doctor);

    // --- 6) Normalize patient snapshot ---
    const patientInfoNormalized = this.#normalizePatientInfo(appointmentData);

    // --- 7) Create ---
    const created = await Appointment.create({
      tenantId: tId,
      doctorId: dId,
      patientId: pId,
      patientInfo: patientInfoNormalized,
      dateTime: appointmentDateTime,
      consultationFee: normalizedFee,
      status: "PENDING",
    });

    return created;
  }

  /**
   * Tenant appointments (Admin view)
   */
  async getTenantAppointments(tenantId, filters = {}) {
    if (!this.#isValidObjectId(tenantId)) throw new Error("Invalid facility (tenant) context.");

    const tId = new mongoose.Types.ObjectId(tenantId);

    return Appointment.find({ tenantId: tId, ...filters })
      .populate("doctorId", "name specialization consultationFee image")
      .populate("patientId", "name email phone contact") // ✅ include contact
      .sort({ dateTime: 1 })
      .lean(); // ✅ faster for read APIs
  }

  /**
   * Patient appointments
   */
  async getPatientAppointments(tenantId, patientId) {
    if (!this.#isValidObjectId(tenantId)) throw new Error("Invalid facility (tenant) context.");
    if (!this.#isValidObjectId(patientId)) throw new Error("Invalid patient context.");

    const tId = new mongoose.Types.ObjectId(tenantId);
    const pId = new mongoose.Types.ObjectId(patientId);

    return Appointment.find({ tenantId: tId, patientId: pId })
      .populate("doctorId", "name specialization image")
      .sort({ dateTime: -1 })
      .lean();
  }

  async updateStatus(tenantId, appointmentId, status) {
    const valid = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"];
    const normalized = String(status || "").toUpperCase();

    if (!valid.includes(normalized)) throw new Error("Invalid protocol status update requested.");
    if (!this.#isValidObjectId(tenantId)) throw new Error("Invalid facility (tenant) context.");
    if (!this.#isValidObjectId(appointmentId)) throw new Error("Invalid protocol record identifier.");

    const tId = new mongoose.Types.ObjectId(tenantId);

    const updated = await Appointment.findOneAndUpdate(
      { _id: appointmentId, tenantId: tId },
      { status: normalized },
      { new: true }
    ).lean();

    if (!updated) throw new Error("Protocol record not found in this facility's registry.");
    return updated;
  }

  async cancelAppointment(tenantId, appointmentId) {
    if (!this.#isValidObjectId(tenantId)) throw new Error("Invalid facility (tenant) context.");
    if (!this.#isValidObjectId(appointmentId)) throw new Error("Invalid protocol record identifier.");

    const tId = new mongoose.Types.ObjectId(tenantId);

    return Appointment.findOneAndUpdate(
      { _id: appointmentId, tenantId: tId },
      { status: "CANCELLED" },
      { new: true }
    ).lean();
  }
}

export default new AppointmentService();
