import express from "express";
import { checkSentiment, analyzeSentiment, saveSentiment, batchAnalyzeSentiment } from "../controllers/sentiment.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// All sentiment routes require authentication
router.post("/check", protect, checkSentiment);
router.post("/analyze", protect, analyzeSentiment);
router.post("/save", protect, saveSentiment);
router.post("/batch-analyze", protect, batchAnalyzeSentiment);

export default router;

