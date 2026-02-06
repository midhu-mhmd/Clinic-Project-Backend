import Appointment from "../models/appointmentModel.js";
import Doctor from "../models/doctorModel.js";
import mongoose from "mongoose";

class AppointmentService {
  // ---------- helpers ----------
  #isValidObjectId(id) {
    return Boolean(id) && mongoose.Types.ObjectId.isValid(id);
  }

  #toObjectId(id) {
    return new mongoose.Types.ObjectId(String(id));
  }

  #parseDateTime(dateStr, slotStr) {
    // dateStr: "YYYY-MM-DD", slotStr: "HH:mm"
    if (!dateStr || !slotStr) return null;

    const [y, m, d] = String(dateStr).split("-").map(Number);
    const [hh, mm] = String(slotStr).split(":").map(Number);

    const bad =
      !Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) ||
      !Number.isFinite(hh) || !Number.isFinite(mm) ||
      m < 1 || m > 12 || d < 1 || d > 31 ||
      hh < 0 || hh > 23 || mm < 0 || mm > 59;

    if (bad) return null;

    // Local time Date object (Asia/Kolkata on your machine)
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    if (Number.isNaN(dt.getTime())) return null;

    return dt;
  }

  #normalizeFee(fee, doctor) {
    if (fee !== undefined && fee !== null && fee !== "") {
      const parsed = Number(fee);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("Invalid consultation fee.");
      }
      return parsed;
    }
    const fallback = doctor?.consultationFee ?? doctor?.fee ?? 0;
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

    const info =
      patientInfo && typeof patientInfo === "object" ? patientInfo : {};

    const name = String(info.name ?? patientName ?? "").trim();
    const email = String(info.email ?? patientEmail ?? "")
      .trim()
      .toLowerCase();

    // Always store phone in `contact` (as per your UI)
    const phone = String(
      info.contact ?? info.phone ?? patientContact ?? contact ?? ""
    ).trim();

    const sx = String(info.symptoms ?? symptoms ?? notes ?? "").trim();

    if (!name) throw new Error("Patient name is required.");
    if (!phone) throw new Error("Patient contact is required.");

    return { name, email, contact: phone, symptoms: sx };
  }

  /**
   * Create appointment (Patient booking)
   * - tenantId comes from body (public clinic)
   * - patientId MUST be injected by controller from req.user._id
   */
  async createAppointment(tenantId, appointmentData) {
    const { doctorId, patientId, date, slot, fee } = appointmentData;

    // 1) Validate IDs
    if (!this.#isValidObjectId(tenantId)) {
      throw new Error("Invalid clinic (tenantId).");
    }
    if (!this.#isValidObjectId(doctorId)) {
      throw new Error("Invalid doctorId.");
    }

    // IMPORTANT: must come from auth context (controller)
    if (!this.#isValidObjectId(patientId)) {
      throw new Error("Patient auth missing. Please login again.");
    }

    // 2) Parse datetime
    const appointmentDateTime = this.#parseDateTime(date, slot);
    if (!appointmentDateTime) throw new Error("Invalid date/slot.");

    const tId = this.#toObjectId(tenantId);
    const dId = this.#toObjectId(doctorId);
    const pId = this.#toObjectId(patientId);

    // 3) Verify doctor belongs to tenant
    const doctor = await Doctor.findById(dId)
      .select("tenantId consultationFee fee")
      .lean();

    if (!doctor) throw new Error("Doctor not found.");

    if (String(doctor.tenantId) !== String(tId)) {
      throw new Error("Doctor does not belong to this clinic.");
    }

    // 4) Prevent double booking (business rule)
    const clash = await Appointment.exists({
      doctorId: dId,
      tenantId: tId,
      dateTime: appointmentDateTime,
      status: { $in: ["PENDING", "CONFIRMED"] },
    });

    if (clash) {
      throw new Error("This slot is already booked.");
    }

    // 5) Normalize fee + patient snapshot
    const consultationFee = this.#normalizeFee(fee, doctor);
    const patientInfoNormalized = this.#normalizePatientInfo(appointmentData);

    // 6) Create
    try {
      const created = await Appointment.create({
        tenantId: tId,
        doctorId: dId,
        patientId: pId,
        patientInfo: patientInfoNormalized,
        dateTime: appointmentDateTime,
        consultationFee,
        status: "PENDING",
      });

      return created;
    } catch (err) {
      // If you keep unique index, duplicate slot will throw E11000
      if (err?.code === 11000) {
        throw new Error("This slot is already booked.");
      }
      throw err;
    }
  }

  async getTenantAppointments(tenantId, filters = {}) {
    if (!this.#isValidObjectId(tenantId)) throw new Error("Invalid tenantId.");

    const tId = this.#toObjectId(tenantId);

    return Appointment.find({ tenantId: tId, ...filters })
      .populate("doctorId", "name specialization consultationFee image")
      .populate("patientId", "name email phone contact")
      .sort({ dateTime: 1 })
      .lean();
  }

  async getPatientAppointments(tenantId, patientId) {
    if (!this.#isValidObjectId(tenantId)) throw new Error("Invalid tenantId.");
    if (!this.#isValidObjectId(patientId)) throw new Error("Invalid patientId.");

    const tId = this.#toObjectId(tenantId);
    const pId = this.#toObjectId(patientId);

    return Appointment.find({ tenantId: tId, patientId: pId })
      .populate("doctorId", "name specialization image")
      .sort({ dateTime: -1 })
      .lean();
  }

  async updateStatus(tenantId, appointmentId, status) {
    const valid = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"];
    const normalized = String(status || "").toUpperCase();

    if (!valid.includes(normalized)) throw new Error("Invalid status.");
    if (!this.#isValidObjectId(tenantId)) throw new Error("Invalid tenantId.");
    if (!this.#isValidObjectId(appointmentId)) throw new Error("Invalid appointmentId.");

    const tId = this.#toObjectId(tenantId);

    const updated = await Appointment.findOneAndUpdate(
      { _id: appointmentId, tenantId: tId },
      { status: normalized },
      { new: true }
    ).lean();

    if (!updated) throw new Error("Appointment not found for this clinic.");
    return updated;
  }

  async cancelAppointment(tenantId, appointmentId) {
    if (!this.#isValidObjectId(tenantId)) throw new Error("Invalid tenantId.");
    if (!this.#isValidObjectId(appointmentId)) throw new Error("Invalid appointmentId.");

    const tId = this.#toObjectId(tenantId);

    return Appointment.findOneAndUpdate(
      { _id: appointmentId, tenantId: tId },
      { status: "CANCELLED" },
      { new: true }
    ).lean();
  }
}

export default new AppointmentService();
