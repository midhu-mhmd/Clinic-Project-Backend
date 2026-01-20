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
      experience: Number(doctorData.experience) || 0,
    });

    return await doctor.save();
  }

  /**
   * NEW: GET ALL doctors across ALL clinics (Public/Patient view)
   */
  async getAllDoctorsPublic() {
    // We remove the tenantId filter here to fetch every doctor in the database
    // only filtering out those that are soft-deleted.
    return await Doctor.find({ isDeleted: { $ne: true } })
      .populate("tenantId", "name") // Optional: brings in the clinic name
      .sort({ createdAt: -1 });
  }

  /**
   * GET ALL doctors for a specific tenant (Admin view)
   */
  async getDoctors(tenantId) {
    return await Doctor.find({ tenantId, isDeleted: { $ne: true } }).sort({ createdAt: -1 });
  }

  /**
   * GET SINGLE doctor
   */
  async getDoctorById(tenantId, doctorId) {
    return await Doctor.findOne({ _id: doctorId, tenantId });
  }

  /**
   * NEW: GET SINGLE doctor by ID only (Public/Patient view)
   * Required for the patient to see details without needing the admin's tenantId
   */
  async getDoctorByIdPublic(doctorId) {
    return await Doctor.findOne({ _id: doctorId, isDeleted: { $ne: true } });
  }

  /**
   * UPDATE doctor
   */
  async updateDoctor(tenantId, doctorId, updateData) {
    const dataToUpdate = { ...updateData };

    if (dataToUpdate.experience !== undefined) {
      dataToUpdate.experience = Number(dataToUpdate.experience) || 0;
    }

    delete dataToUpdate.tenantId;
    delete dataToUpdate._id;

    const updatedDoctor = await Doctor.findOneAndUpdate(
      { _id: doctorId, tenantId },
      { $set: dataToUpdate },
      {
        new: true, 
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