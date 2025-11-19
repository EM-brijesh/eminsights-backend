// routes/auth.routes.js
import express from "express";
import {
  signup,
  signin,
  forgotPassword,
  resetPassword,
  validateResetToken,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/signin", signin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.get("/reset-password/:token", validateResetToken);

export default router;
