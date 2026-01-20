import Doctor from "../models/doctorModel.js";

/**
 * Service layer for Medical Practitioners
 */
class DoctorService {

  /**
   * CREATE doctor
   */
  async createDoctor(tenantId, doctorData, imageUrl = "", imagePublicId = "") {
    const doctor = new Doctor({
      ...doctorData,
      tenantId,
      image: imageUrl,
      imagePublicId,
      // Ensure experience is a number, default to 0
      experience: Number(doctorData.experience) || 0,
    });

    return await doctor.save();
  }

  /**
   * GET ALL doctors for tenant
   */
  async getDoctors(tenantId) {
    // Only fetch doctors that aren't soft-deleted
    return await Doctor.find({ tenantId, isDeleted: { $ne: true } }).sort({ createdAt: -1 });
  }

  /**
   * GET SINGLE doctor (For internal controller checks like finding old images)
   */
  async getDoctorById(tenantId, doctorId) {
    return await Doctor.findOne({ _id: doctorId, tenantId });
  }

  /**
   * UPDATE doctor
   */
  async updateDoctor(tenantId, doctorId, updateData) {
    const dataToUpdate = { ...updateData };

    // 1. Sanitize experience to prevent string conversion issues
    if (dataToUpdate.experience !== undefined) {
      dataToUpdate.experience = Number(dataToUpdate.experience) || 0;
    }

    // 2. Security: Never allow tenantId or ID to be changed via updateData
    delete dataToUpdate.tenantId;
    delete dataToUpdate._id;

    // 3. Perform Update
    const updatedDoctor = await Doctor.findOneAndUpdate(
      { _id: doctorId, tenantId },
      { $set: dataToUpdate },
      {
        new: true, // Return the modified document
        runValidators: true,
      }
    );

    return updatedDoctor;
  }

  /**
   * SOFT DELETE doctor
   */
  async softDeleteDoctor(tenantId, doctorId) {
    return await Doctor.findOneAndUpdate(
      { _id: doctorId, tenantId },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          isActive: false,
        }
      },
      { new: true }
    );
  }
}

export default new DoctorService();