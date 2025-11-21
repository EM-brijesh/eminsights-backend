// routes/sentiment.route.js
import express from "express";
import { protect } from "../middleware/auth.js";
import {
  analyzeSentiment,
  saveSentimentToDB,
  checkSentimentStatus,
} from "../controllers/sentiment.controller.js";

const router = express.Router();

/**
 * POST /api/sentiment/analyze
 * Analyze sentiment of posts using Gemini API
 * Body: { posts: Array<Post> }
 */
router.post("/analyze", protect, async (req, res) => {
  try {
    const { posts } = req.body;

    if (!posts || !Array.isArray(posts)) {
      return res.status(400).json({
        success: false,
        message: "Posts array is required",
      });
    }

    // Analyze sentiment
    const analyzedPosts = await analyzeSentiment(posts);

    res.json({
      success: true,
      count: analyzedPosts.length,
      data: analyzedPosts,
      warning: !process.env.GEMINI_API_KEY ? "Gemini API key not configured. Using neutral sentiment as fallback." : undefined,
    });
  } catch (error) {
    console.error("Sentiment analysis error:", error);
    // If API key is missing, return neutral sentiment instead of error
    if (error.message.includes("Gemini API key not configured")) {
      const neutralPosts = posts.map(p => ({
        ...p,
        sentiment: "neutral",
        sentimentScore: 0.5,
      }));
      return res.json({
        success: true,
        count: neutralPosts.length,
        data: neutralPosts,
        warning: "Gemini API key not configured. Using neutral sentiment as fallback.",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Failed to analyze sentiment",
    });
  }
});

/**
 * POST /api/sentiment/save
 * Save sentiment analysis results to database
 * Body: { posts: Array<Post> }
 */
router.post("/save", protect, async (req, res) => {
  try {
    const { posts } = req.body;

    if (!posts || !Array.isArray(posts)) {
      return res.status(400).json({
        success: false,
        message: "Posts array is required",
      });
    }

    const result = await saveSentimentToDB(posts);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Save sentiment error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to save sentiment",
    });
  }
});

/**
 * POST /api/sentiment/check
 * Check which posts need sentiment analysis
 * Body: { posts: Array<Post> }
 */
router.post("/check", protect, async (req, res) => {
  try {
    const { posts } = req.body;

    if (!posts || !Array.isArray(posts)) {
      return res.status(400).json({
        success: false,
        message: "Posts array is required",
      });
    }

    const status = checkSentimentStatus(posts);

    res.json({
      success: true,
      needsAnalysis: status.postsToAnalyze.length,
      hasSentiment: status.postsWithSentiment.length,
      total: posts.length,
      postsToAnalyze: status.postsToAnalyze,
      postsWithSentiment: status.postsWithSentiment,
    });
  } catch (error) {
    console.error("Check sentiment status error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to check sentiment status",
    });
  }
});

export default router;

