// controllers/users.controller.js
import { User } from "../models/user.js";

export const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    
    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const assignedRole = role === "admin" ? "admin" : "user";
    // Use name if provided, otherwise use email prefix as fallback
    const userName = name?.trim() || email?.split('@')[0] || "User";
    
    const user = await User.create({ 
      name: userName, 
      email, 
      password, 
      role: assignedRole 
    });

    return res.json({
      success: true,
      message: "User created",
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role 
      },
    });
  } catch (err) {
    console.error("Create User Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


