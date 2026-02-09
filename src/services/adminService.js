import User from "../models/userModel.js";
import Tenant from "../models/tenantModel.js";

/**
 * Fetches platform-wide statistics for the Super Admin
 * Uses parallel execution for optimal performance.
 * Returns raw numbers to avoid server-side formatting errors.
 */
export const getSuperAdminStats = async () => {
  try {
    const [
      totalClinics,
      totalPatients,
      totalClinicAdmins,
      activeSubscriptions,
      recentTenants
    ] = await Promise.all([
      Tenant.countDocuments(),
      User.countDocuments({ role: "PATIENT" }),
      User.countDocuments({ role: "CLINIC_ADMIN" }),
      Tenant.countDocuments({ isVerified: true }), 
      Tenant.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name email createdAt isActive")
    ]);

    // ✅ Return raw numbers only. 
    // The Frontend will handle the "₹" symbol and Lakhs/Crores formatting.
    return {
      overview: {
        totalClinics: totalClinics || 0,
        totalPatients: totalPatients || 0,
        totalClinicAdmins: totalClinicAdmins || 0,
        activeSubscriptions: activeSubscriptions || 0,
        totalRevenue: 0 // Placeholder: Always send a number, never a formatted string
      },
      recentTenants: recentTenants || [],
      serverTime: new Date()
    };
  } catch (error) {
    // Keep error messages clean to avoid leaking internal formatting logic
    throw new Error(`Platform Stats Error: ${error.message}`);
  }
};

/**
 * Manage global tenant status (Suspend/Activate)
 */
export const toggleTenantAccess = async (tenantId, isActive) => {
  try {
    const tenant = await Tenant.findByIdAndUpdate(
      tenantId,
      { isActive },
      { new: true }
    );
    if (!tenant) throw new Error("Tenant not found");
    return tenant;
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Fetch all users across the entire platform (Super Admin view)
 */
export const getAllPlatformUsers = async (query = {}) => {
  try {
    return await User.find(query)
      .populate("tenantId", "name")
      .sort({ createdAt: -1 });
  } catch (error) {
    throw new Error(`User Fetch Error: ${error.message}`);
  }
};