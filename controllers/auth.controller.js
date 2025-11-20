// controllers/auth.controller.js
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User } from "../models/user.js";
import nodemailer from "nodemailer";

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
    
    // 👇 CHANGE THIS LINE
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    
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
      resetPasswordExpires: { $gt: new Date() }, // Changed from Date.now()

    });

    if (!user)
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
        code: "TOKEN_INVALID",
      });

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
    
    // Find user first
    const user = await User.findOne({ resetPasswordToken: token }).select("email resetPasswordExpires");
    
    console.log("🔍 Debug Info:");
    console.log("Token:", token);
    console.log("User found:", !!user);
    
    if (user) {
      const now = new Date();
      const expiry = new Date(user.resetPasswordExpires);
      console.log("Current time:", now.toISOString());
      console.log("Expiry time:", expiry.toISOString());
      console.log("Time until expiry (minutes):", (expiry - now) / 60000);
      console.log("Is expired?", now > expiry);
    }
    
    // Now check with expiry
    const validUser = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }, // Use new Date() instead of Date.now()
    }).select("email");

    if (!validUser) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
        code: "TOKEN_INVALID",
      });
    }

    return res.json({
      success: true,
      emailMasked: maskEmail(validUser.email),
    });
  } catch (err) {
    console.error("Validate Reset Token Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
