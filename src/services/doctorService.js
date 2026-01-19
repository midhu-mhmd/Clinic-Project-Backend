import Doctor from "../models/doctorModel.js";

/**
 * Service to handle Business Logic for Medical Practitioners
 * Includes Multi-tenancy support and Soft Delete handling
 */
class DoctorService {
  /**
   * CREATE: logic for adding a new doctor
   */
  async createDoctor(tenantId, doctorData, filePath) {
    const doctor = new Doctor({
      ...doctorData,
      tenantId,
      image: filePath || "", // Save path provided by Multer
      // Ensure experience is stored as a number (FormData sends strings)
      experience: Number(doctorData.experience) || 0,
    });
    return await doctor.save();
  }

  /**
   * GET ALL: Filtered by the active tenant
   */
  async getDoctors(tenantId) {
    // Your 'pre-find' middleware in doctorModel handles isDeleted: false automatically
    return await Doctor.find({ tenantId }).sort({ createdAt: -1 });
  }

  /**
   * UPDATE: Logic for the "Edit" functionality
   */
  async updateDoctor(tenantId, doctorId, updateData, filePath) {
    const dataToUpdate = { ...updateData };

    // 1. Data Sanitization
    // Convert experience to Number to match Mongoose Schema requirements
    if (dataToUpdate.experience !== undefined) {
      dataToUpdate.experience = Number(dataToUpdate.experience);
    }

    // 2. Image Logic
    // Only update the 'image' field if a NEW file was actually uploaded.
    // This prevents overwriting the existing image URL with an empty string.
    if (filePath) {
      dataToUpdate.image = filePath;
    } else {
      // Remove 'image' from the update object if no new file is provided
      delete dataToUpdate.image; 
    }

    // 3. Update Database
    // Query includes tenantId to ensure strict data isolation between tenants
    const updatedDoctor = await Doctor.findOneAndUpdate(
      { _id: doctorId, tenantId },
      { $set: dataToUpdate },
      { new: true, runValidators: true }
    );

    return updatedDoctor;
  }

  /**
   * SOFT DELETE: Archives record instead of permanent removal
   */
  async softDeleteDoctor(tenantId, doctorId) {
    return await Doctor.findOneAndUpdate(
      { _id: doctorId, tenantId },
      { 
        isDeleted: true, 
        deletedAt: new Date(),
        isActive: false 
      },
      { new: true }
    );
  }
}

export default new DoctorService();