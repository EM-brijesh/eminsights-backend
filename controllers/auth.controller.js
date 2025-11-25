// controllers/auth.controller.js
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User } from "../models/user.js";
import nodemailer from "nodemailer";
import { Brand } from "../models/brand.js";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const JWT_EXPIRES_IN = "7d";

const maskEmail = (email = "") => {
  const [name = "", domain = ""] = String(email).split("@");
  if (!name || !domain) return "";
  if (name.length <= 2) return `${name[0] || "*"}***@${domain}`;
  return `${name[0]}***${name.slice(-1)}@${domain}`;
};

// 🔑 helper to create JWT
const createToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name || "",
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/** ───────────── SIGNUP ───────────── **/
export const signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });

    const user = await User.create({
      name,
      email,
      password,
      role: role === "admin" ? "admin" : "user",
    });

    res.json({
      success: true,
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/** ───────────── SIGNIN ───────────── **/
export const signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ success: false, message: "Invalid email or password" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch)
      return res.status(400).json({ success: false, message: "Invalid email or password" });

    const token = createToken(user);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Signin Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/** ───────────── FORGOT PASSWORD ───────────── **/
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    
    // 👇 CREATE DATE IN UTC EXPLICITLY
    const expiryTime = new Date();
    expiryTime.setUTCHours(expiryTime.getUTCHours() + 1);
    user.resetPasswordExpires = expiryTime;
    
    console.log("⏰ Setting expiry to:", expiryTime.toISOString());
    console.log("⏰ Current UTC time:", new Date().toISOString());
    
    await user.save();

    const resetURL = `${process.env.REST_URL}/reset-password/${resetToken}`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      to: user.email,
      from: process.env.SMTP_USER,
      subject: "Password Reset",
      html: `<p>Click <a href="${resetURL}">here</a> to reset your password. This link expires in 1 hour.</p>`,
    });

    res.json({ success: true, message: "Password reset email sent" });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/** ───────────── RESET PASSWORD ───────────── **/
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid token",
        code: "TOKEN_INVALID",
      });
    }

    // 👇 COMPARE AS TIMESTAMPS
    const nowTimestamp = Date.now();
    const expiryTimestamp = new Date(user.resetPasswordExpires).getTime();
    
    console.log("⏰ Reset - Now:", nowTimestamp, new Date(nowTimestamp).toISOString());
    console.log("⏰ Reset - Expiry:", expiryTimestamp, new Date(expiryTimestamp).toISOString());
    
    if (nowTimestamp >= expiryTimestamp) {
      return res.status(400).json({
        success: false,
        message: "Token has expired",
        code: "TOKEN_EXPIRED",
      });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const validateResetToken = async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({ 
      resetPasswordToken: token 
    }).select("email resetPasswordExpires");

    if (!user) {
      console.log("❌ No user found with token");
      return res.status(400).json({
        success: false,
        message: "Invalid token",
        code: "TOKEN_INVALID",
      });
    }

    // 👇 CONVERT EVERYTHING TO TIMESTAMPS (milliseconds since epoch)
    const nowTimestamp = Date.now();
    const expiryTimestamp = new Date(user.resetPasswordExpires).getTime();
    
    console.log("========== VALIDATE TOKEN ==========");
    console.log("⏰ Now (timestamp):", nowTimestamp);
    console.log("⏰ Expiry (timestamp):", expiryTimestamp);
    console.log("⏰ Difference (ms):", expiryTimestamp - nowTimestamp);
    console.log("⏰ Minutes remaining:", (expiryTimestamp - nowTimestamp) / 60000);
    console.log("⏰ Now (ISO):", new Date(nowTimestamp).toISOString());
    console.log("⏰ Expiry (ISO):", new Date(expiryTimestamp).toISOString());
    console.log("⏰ Is expired?:", nowTimestamp >= expiryTimestamp);
    console.log("====================================");

    if (nowTimestamp >= expiryTimestamp) {
      return res.status(400).json({
        success: false,
        message: "Token has expired",
        code: "TOKEN_EXPIRED",
      });
    }

    return res.json({
      success: true,
      emailMasked: maskEmail(user.email),
    });
  } catch (err) {
    console.error("Validate Reset Token Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

//get list of users and the brands assigned to them
export const getUsers = async (req, res) => {
  try {
    // Get all users
    const users = await User.find({}, "name email role").lean();

    // Get all brands
    const brands = await Brand.find({}, "brandName assignedUsers").lean();

    // Attach brands to each user based on matching email
    const usersWithBrands = users.map(user => {
      const userBrands = brands.filter(brand =>
        Array.isArray(brand.assignedUsers) &&
        brand.assignedUsers.includes(user.email.toLowerCase())
      );

      return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        brands: userBrands
      };
    });

    res.json(usersWithBrands);

  } catch (err) {
    console.error("Get All Users Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};




//get list of brands and there users
export const getAdmins = async (req , res) => {
  try {
    const admins = await User.find({ role: 'admin' }).exec();
    res.json(admins.map((user) => {
      return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      }
    }));
  }catch (err) {
    console.error("Get Admins Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}


