import Doctor from "../models/doctorModel.js";

class DoctorService {
  /**
   * CREATE: Initialize a new doctor profile under a specific tenant
   */
  async createDoctor(tenantId, doctorData, imageUrl = "", imagePublicId = "") {
    const doctor = new Doctor({
      ...doctorData,
      tenantId,
      image: imageUrl,
      imagePublicId,
      // Ensure numeric values are properly cast
      experience: Number(doctorData.experience) || 0,
      consultationFee: Number(doctorData.consultationFee) || 0,
    });

    return await doctor.save();
  }

  /**
   * READ: Fetch all doctors for the public directory (cross-tenant)
   */
  async getAllDoctorsPublic() {
    return await Doctor.find({ isDeleted: { $ne: true } })
      .populate("tenantId", "name")
      .sort({ createdAt: -1 });
  }

  /**
   * READ: Fetch all doctors belonging to a specific clinic (Tenant)
   * This matches your frontend request: /api/doctors/clinic/:clinicId
   */
  async getDoctorsByClinic(clinicId) {
    return await Doctor.find({ 
      tenantId: clinicId, 
      isDeleted: { $ne: true } 
    }).sort({
      createdAt: -1,
    });
  }

  /**
   * READ: Admin/Staff view of doctors for a specific tenant
   */
  async getDoctors(tenantId) {
    return await Doctor.find({ tenantId, isDeleted: { $ne: true } }).sort({
      createdAt: -1,
    });
  }

  /**
   * READ: Get single doctor details (Private/Tenant restricted)
   */
  async getDoctorById(tenantId, doctorId) {
    return await Doctor.findOne({ _id: doctorId, tenantId });
  }

  /**
   * READ: Get single doctor details (Public)
   */
  async getDoctorByIdPublic(doctorId) {
    return await Doctor.findOne({ _id: doctorId, isDeleted: { $ne: true } });
  }

  /**
   * UPDATE: Modify doctor details
   */
  async updateDoctor(tenantId, doctorId, updateData) {
    const dataToUpdate = { ...updateData };

    // Explicitly handle numeric conversions for updates
    if (dataToUpdate.experience !== undefined) {
      dataToUpdate.experience = Number(dataToUpdate.experience) || 0;
    }
    
    if (dataToUpdate.consultationFee !== undefined) {
      dataToUpdate.consultationFee = Number(dataToUpdate.consultationFee) || 0;
    }

    // Security: Prevent overriding the tenant link or ID
    delete dataToUpdate.tenantId;
    delete dataToUpdate._id;

    const updatedDoctor = await Doctor.findOneAndUpdate(
      { _id: doctorId, tenantId },
      { $set: dataToUpdate },
      {
        new: true,
        runValidators: true,
      },
    );

    return updatedDoctor;
  }

  /**
   * DELETE: Soft delete a doctor profile
   */
  async softDeleteDoctor(tenantId, doctorId) {
    return await Doctor.findOneAndUpdate(
      { _id: doctorId, tenantId },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          isActive: false,
        },
      },
      { new: true },
    );
  }
}

export default new DoctorService();