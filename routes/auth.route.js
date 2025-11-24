// routes/auth.routes.js
import express from "express";
import {
  signup,
  signin,
  forgotPassword,
  resetPassword,
  validateResetToken,
  getUsers,
  getAdmins,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/signin", signin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.get("/validate-reset-token/:token", validateResetToken);
router.get("/getallusers" , getUsers);
router.get("/getadmins" , getAdmins);

export default router;
