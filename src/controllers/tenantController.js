import * as tenantService from "../services/tenantService.js";
import jwt from "jsonwebtoken";

export const createTenant = async (req, res) => {
  try {
    const { owner, clinic } = req.body;

    const { user, tenant } = await tenantService.registerClinicTransaction(owner, clinic);

    // Generate Token with Tenant Context
    const token = jwt.sign(
      { id: user._id, tenantId: tenant._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      success: true,
      token,
      user: { id: user._id, name: user.name, tenantId: user.tenantId },
      clinic: tenant
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};