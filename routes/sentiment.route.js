import express from "express";
import {
  analyzeSentiment,
  batchAnalyzeSentiment,
  checkSentiment,
  getSentimentSummary,
  updateManualSentiment,
  updateManualSentimentBulk,
  saveSentiment,
} from "../controllers/sentiment.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/check", protect, checkSentiment);
router.post("/analyze", protect, analyzeSentiment);
router.post("/save", protect, saveSentiment);
router.post("/batch-analyze", protect, batchAnalyzeSentiment);
router.get("/summary", protect, getSentimentSummary);
router.patch("/manual", protect, updateManualSentiment);
router.patch("/manual/bulk", protect, updateManualSentimentBulk);

export default router;

