import Tenant from "../models/tenantModel.js";
import User from "../models/userModel.js";
import bcrypt from "bcryptjs";

export const registerClinicTransaction = async (ownerData, clinicData) => {
  try {
    // 1. Check if user already exists
    const existingUser = await User.findOne({ email: ownerData.email });
    if (existingUser) throw new Error("Email already registered");

    // 2. Hash Password
    const hashedPassword = await bcrypt.hash(ownerData.password, 12);

    // 3. Create the Identity (User)
    const user = new User({ 
      ...ownerData, 
      password: hashedPassword, 
      role: "CLINIC_ADMIN" 
    });
    await user.save();

    // 4. Create the Entity (Tenant) linked to User
    const tenant = new Tenant({ 
      ...clinicData, 
      ownerId: user._id,
      slug: clinicData.name.toLowerCase().trim().replace(/\s+/g, "-") 
    });
    await tenant.save();

    // 5. Update User with Tenant ID for isolation
    user.tenantId = tenant._id;
    await user.save();

    return { user, tenant };
  } catch (error) {
    console.error("Registration Service Error:", error.message);
    throw error;
  }
};