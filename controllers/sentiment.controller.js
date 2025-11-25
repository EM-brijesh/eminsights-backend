import { SocialPost } from "../models/data.js";
import { Brand } from "../models/brand.js";
import { analyzePostsSentiment } from "../services/sentiment.service.js";

/**
 * Check which posts already have sentiment analysis
 * POST /api/sentiment/check
 * Body: { posts: Array<Object> } - Array of post objects with _id or id
 */
export const checkSentiment = async (req, res) => {
  try {
    const { posts } = req.body;

    if (!Array.isArray(posts) || posts.length === 0) {
      return res.json({
        success: true,
        postsWithSentiment: [],
        postsToAnalyze: [],
      });
    }

    // Extract post IDs
    const postIds = posts
      .map((post) => post._id || post.id)
      .filter(Boolean)
      .map((id) => String(id));

    if (postIds.length === 0) {
      return res.json({
        success: true,
        postsWithSentiment: [],
        postsToAnalyze: posts,
      });
    }

    // Find posts that already have sentiment
    const postsWithSentiment = await SocialPost.find({
      _id: { $in: postIds },
      sentiment: { $exists: true, $ne: null },
    }).lean();

    const postsWithSentimentIds = new Set(
      postsWithSentiment.map((p) => String(p._id))
    );

    // Separate posts that need analysis
    const postsToAnalyze = posts.filter(
      (post) => !postsWithSentimentIds.has(String(post._id || post.id))
    );

    res.json({
      success: true,
      postsWithSentiment,
      postsToAnalyze,
    });
  } catch (error) {
    console.error("Check sentiment error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Analyze sentiment for posts
 * POST /api/sentiment/analyze
 * Body: { posts: Array<Object> } - Array of post objects to analyze
 */
export const analyzeSentiment = async (req, res) => {
  try {
    const { posts } = req.body;

    if (!Array.isArray(posts) || posts.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    // Analyze sentiment for all posts
    const analyzedPosts = await analyzePostsSentiment(posts, 5);

    res.json({
      success: true,
      data: analyzedPosts,
    });
  } catch (error) {
    console.error("Analyze sentiment error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Save sentiment analysis results to database
 * POST /api/sentiment/save
 * Body: { posts: Array<Object> } - Array of analyzed post objects
 */
export const saveSentiment = async (req, res) => {
  try {
    const { posts } = req.body;

    if (!Array.isArray(posts) || posts.length === 0) {
      return res.json({
        success: true,
        saved: 0,
      });
    }

    let savedCount = 0;

    // Update each post with sentiment data
    for (const post of posts) {
      const postId = post._id || post.id;
      if (!postId) continue;

      try {
        await SocialPost.updateOne(
          { _id: postId },
          {
            $set: {
              sentiment: post.sentiment || null,
              sentimentScore: post.sentimentScore || null,
              sentimentAnalyzedAt: post.sentimentAnalyzedAt || new Date(),
              "analysis.sentiment": post.sentiment || null,
            },
          }
        );
        savedCount++;
      } catch (updateError) {
        console.error(`Failed to save sentiment for post ${postId}:`, updateError.message);
      }
    }

    res.json({
      success: true,
      saved: savedCount,
      total: posts.length,
    });
  } catch (error) {
    console.error("Save sentiment error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Batch analyze existing posts that don't have sentiment
 * POST /api/sentiment/batch-analyze
 * Body: { 
 *   brandName (optional): Filter by brand
 *   platform (optional): Filter by platform
 *   limit (optional): Max number of posts to analyze (default: 100)
 *   batchSize (optional): Number of posts to process at once (default: 10)
 * }
 */
export const batchAnalyzeSentiment = async (req, res) => {
  try {
    const { brandName, platform, limit = 100, batchSize = 10 } = req.body;

    // Build filter for posts without sentiment
    const filter = {
      $or: [
        { sentiment: { $exists: false } },
        { sentiment: null },
      ],
    };

    // Add brand filter if provided
    if (brandName) {
      const brand = await Brand.findOne({ brandName });
      if (!brand) {
        return res.status(404).json({
          success: false,
          message: "Brand not found",
        });
      }
      filter.brand = brand._id;
    }

    // Add platform filter if provided
    if (platform) {
      filter.platform = platform;
    }

    // Find posts without sentiment
    const postsToAnalyze = await SocialPost.find(filter)
      .limit(Number(limit))
      .lean();

    if (postsToAnalyze.length === 0) {
      return res.json({
        success: true,
        message: "No posts found without sentiment analysis",
        analyzed: 0,
        total: 0,
      });
    }

    console.log(`Starting batch sentiment analysis for ${postsToAnalyze.length} posts...`);

    // Process in batches
    let analyzedCount = 0;
    let savedCount = 0;

    for (let i = 0; i < postsToAnalyze.length; i += batchSize) {
      const batch = postsToAnalyze.slice(i, i + batchSize);
      
      try {
        // Analyze sentiment for batch
        const analyzedBatch = await analyzePostsSentiment(batch, 5);
        analyzedCount += analyzedBatch.length;

        // Save to database
        for (const post of analyzedBatch) {
          try {
            await SocialPost.updateOne(
              { _id: post._id },
              {
                $set: {
                  sentiment: post.sentiment || null,
                  sentimentScore: post.sentimentScore || null,
                  sentimentAnalyzedAt: post.sentimentAnalyzedAt || new Date(),
                  "analysis.sentiment": post.sentiment || null,
                },
              }
            );
            savedCount++;
          } catch (updateError) {
            console.error(`Failed to save sentiment for post ${post._id}:`, updateError.message);
          }
        }

        console.log(`Processed batch ${Math.floor(i / batchSize) + 1}: ${analyzedBatch.length} posts analyzed`);
      } catch (batchError) {
        console.error(`Error processing batch ${Math.floor(i / batchSize) + 1}:`, batchError.message);
        // Continue with next batch
      }
    }

    res.json({
      success: true,
      message: `Batch sentiment analysis completed`,
      analyzed: analyzedCount,
      saved: savedCount,
      total: postsToAnalyze.length,
    });
  } catch (error) {
    console.error("Batch analyze sentiment error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

