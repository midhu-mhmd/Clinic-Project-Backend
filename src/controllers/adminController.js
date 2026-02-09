import * as adminService from "../services/adminService.js";

/**
 * @desc    Get platform-wide dashboard stats
 * @route   GET /api/admin/stats
 * @access  Private (Super Admin)
 */
export const getStats = async (req, res) => {
  try {
    // The error is happening INSIDE this function call
    const stats = await adminService.getSuperAdminStats();
    
    // We force everything to be a Number to ensure the frontend 
    // formatters receive valid input.
    const responseData = {
      overview: {
        totalClinics: Number(stats?.overview?.totalClinics ?? 0),
        totalPatients: Number(stats?.overview?.totalPatients ?? 0),
        totalClinicAdmins: Number(stats?.overview?.totalClinicAdmins ?? 0),
        activeSubscriptions: Number(stats?.overview?.activeSubscriptions ?? 0),
        totalRevenue: Number(stats?.overview?.totalRevenue ?? 0),
      },
      recentTenants: Array.isArray(stats?.recentTenants) ? stats.recentTenants : [],
      revenueChart: Array.isArray(stats?.revenueChart) ? stats.revenueChart : [
        { month: "Jan", amount: 0 },
        { month: "Feb", amount: 0 },
        { month: "Mar", amount: 0 }
      ],
      serverTime: new Date().toISOString()
    };

    return res.status(200).json({
      success: true,
      message: "Admin statistics fetched successfully",
      data: responseData,
    });
  } catch (error) {
    // Log the full error stack in the terminal to find the exact file/line
    console.error("Critical Dashboard Error:", error);
    
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

/**
 * @desc    Update a tenant's active status (Suspend/Activate)
 * @route   PATCH /api/admin/tenants/:id/status
 * @access  Private (Super Admin)
 */
export const updateTenantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "Status must be a boolean (true/false)"
      });
    }

    const updatedTenant = await adminService.toggleTenantAccess(id, isActive);

    return res.status(200).json({
      success: true,
      message: `Tenant status updated to ${isActive ? "Active" : "Suspended"}`,
      data: updatedTenant,
    });
  } catch (error) {
    console.error("Update Status Error:", error.message);
    const statusCode = error.message.includes("not found") ? 404 : 500;
    
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Error updating tenant status",
    });
  }
};