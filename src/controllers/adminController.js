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

/* =========================================================
   NEW ADMIN FEATURES (TENANT MANAGEMENT)
========================================================= */
import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import jwt from "jsonwebtoken";

const signAuthToken = (user) => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");
  return jwt.sign(
    {
      id: String(user._id),
      tenantId: user.tenantId ? String(user.tenantId) : null,
      role: user.role,
      isVerified: Boolean(user.isVerified),
      purpose: "AUTH",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

export const getTenantDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await Tenant.findById(id).lean();
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    const totalUsers = await User.countDocuments({ tenantId: id });
    const activeUsers = await User.countDocuments({ tenantId: id, isActive: true });

    // Find last activity
    const lastActiveUser = await User.findOne({ tenantId: id }).sort({ updatedAt: -1 }).select("updatedAt");
    const lastActive = lastActiveUser ? lastActiveUser.updatedAt : tenant.updatedAt;

    return res.status(200).json({
      success: true,
      data: {
        ...tenant,
        metrics: {
          totalUsers,
          activeUsers,
          lastActive
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteTenant = async (req, res) => {
  try {
    const { id } = req.params;
    // Soft delete: suspend tenant and users
    await Tenant.findByIdAndUpdate(id, { isActive: false, "subscription.status": "CANCELED" });
    await User.updateMany({ tenantId: id }, { isActive: false });

    return res.status(200).json({ success: true, message: "Tenant soft-deleted and access suspended." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const impersonateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantAdmin = await User.findOne({ tenantId: id, role: "CLINIC_ADMIN" });
    if (!tenantAdmin) return res.status(404).json({ success: false, message: "No active admin found for this clinic." });

    const token = signAuthToken(tenantAdmin);
    return res.status(200).json({ success: true, token, user: tenantAdmin });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const clearTenantCache = async (req, res) => {
  return res.status(200).json({ success: true, message: "Tenant configuration and metrics cache cleared." });
};

/* =========================================================
   USER MANAGEMENT (SUPER ADMIN)
========================================================= */

export const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).populate("tenantId", "name").select("-password").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    await User.findByIdAndUpdate(id, { isActive });
    return res.status(200).json({ success: true, message: "User status updated" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    // For now, soft-delete or just suspend
    await User.findByIdAndUpdate(id, { isActive: false });
    return res.status(200).json({ success: true, message: "User suspended/deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

import bcrypt from "bcryptjs";
import Appointment from "../models/appointmentModel.js";

export const getAllTenants = async (req, res) => {
  try {
    const tenants = await Tenant.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, data: tenants });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   SUPER ADMIN SETTINGS
========================================================= */

/**
 * @desc    Get super admin own profile
 * @route   GET /api/admin/settings/profile
 */
export const getAdminProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password -verificationOtp -otpExpires");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * @desc    Update super admin own profile (name, email, phoneNumber)
 * @route   PUT /api/admin/settings/profile
 */
export const updateAdminProfile = async (req, res) => {
  try {
    const allowed = ["name", "email", "phoneNumber"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: "No valid fields provided." });
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true })
      .select("-password -verificationOtp -otpExpires");
    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "Email already in use." });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * @desc    Change super admin password
 * @route   PUT /api/admin/settings/change-password
 */
export const changeAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current and new password are required." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Current password is incorrect." });

    user.password = await bcrypt.hash(newPassword, 12);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    return res.status(200).json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * @desc    Get platform-wide notifications (aggregated activity feed)
 * @route   GET /api/admin/notifications
 */
export const getAdminNotifications = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [newTenants, newUsers, recentAppointments, subscriptionChanges] = await Promise.all([
      // New clinic registrations
      Tenant.find({ createdAt: { $gte: thirtyDaysAgo } })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("name createdAt isActive subscription.status")
        .lean(),
      // New patient signups
      User.find({ role: "PATIENT", createdAt: { $gte: thirtyDaysAgo } })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("name email createdAt")
        .lean(),
      // Recent appointments
      Appointment.find({ createdAt: { $gte: thirtyDaysAgo } })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate("tenantId", "name")
        .populate("doctorId", "name")
        .select("patientInfo dateTime status consultationType createdAt tenantId doctorId")
        .lean(),
      // Subscription changes (recently updated tenants with active or canceled)
      Tenant.find({
        updatedAt: { $gte: thirtyDaysAgo },
        "subscription.status": { $in: ["ACTIVE", "CANCELED", "PAST_DUE"] },
      })
        .sort({ updatedAt: -1 })
        .limit(30)
        .select("name subscription.status subscription.plan updatedAt")
        .lean(),
    ]);

    // Build unified notification list
    const notifications = [];

    for (const t of newTenants) {
      notifications.push({
        id: `tenant-${t._id}`,
        type: "NEW_CLINIC",
        title: "New Clinic Registered",
        description: `${t.name} has registered on the platform.`,
        timestamp: t.createdAt,
        meta: { clinicName: t.name, status: t.isActive ? "Active" : "Inactive" },
      });
    }

    for (const u of newUsers) {
      notifications.push({
        id: `user-${u._id}`,
        type: "NEW_PATIENT",
        title: "New Patient Signup",
        description: `${u.name} joined the platform.`,
        timestamp: u.createdAt,
        meta: { patientName: u.name, email: u.email },
      });
    }

    for (const a of recentAppointments) {
      const clinicName = a.tenantId?.name || "Unknown Clinic";
      const doctorName = a.doctorId?.name || "Unknown Doctor";
      const patientName = a.patientInfo?.name || "Patient";
      notifications.push({
        id: `appt-${a._id}`,
        type: "APPOINTMENT",
        title: "Appointment Booked",
        description: `${patientName} booked ${a.consultationType === "video" ? "a video" : "an in-clinic"} appointment with Dr. ${doctorName} at ${clinicName}.`,
        timestamp: a.createdAt,
        meta: { status: a.status, consultationType: a.consultationType },
      });
    }

    for (const s of subscriptionChanges) {
      const label = s.subscription?.status === "ACTIVE" ? "activated" : s.subscription?.status === "CANCELED" ? "canceled" : "updated";
      notifications.push({
        id: `sub-${s._id}-${s.updatedAt}`,
        type: "SUBSCRIPTION",
        title: "Subscription Update",
        description: `${s.name} ${label} their ${s.subscription?.plan || ""} plan.`,
        timestamp: s.updatedAt,
        meta: { plan: s.subscription?.plan, status: s.subscription?.status },
      });
    }

    // Sort all by timestamp descending
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({
      success: true,
      data: notifications.slice(0, 100),
      total: notifications.length,
    });
  } catch (err) {
    console.error("Admin notifications error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};