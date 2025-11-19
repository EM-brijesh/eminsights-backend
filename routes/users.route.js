import { Router } from "express";
import { protect, isAdmin } from "../middleware/auth.js";
import { createUser } from "../controllers/users.controller.js";

const router = Router();

// Admin-only: create a user account
router.post("/create", protect, isAdmin, createUser);

export default router;


