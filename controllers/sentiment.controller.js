<<<<<<< HEAD
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
=======
// controllers/sentiment.controller.js
import { SocialPost } from "../models/data.js";
import dotenv from "dotenv";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Gemini v1beta no longer exposes gemini-pro; default to a supported model.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const BATCH_SIZE = 15; // Process 15 posts at a time to avoid token limits

/**
 * Analyze sentiment of posts using Gemini API
 * @param {Array} posts - Array of posts with text content
 * @returns {Promise<Array>} Array of posts with sentiment analysis
 */
export const analyzeSentiment = async (posts) => {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not found in environment variables");
    console.error("Please add GEMINI_API_KEY to your backend .env file");
    // Return neutral sentiment instead of throwing error
    return posts.map((p) => ({
      ...p,
      sentiment: "neutral",
      sentimentScore: 0.5,
    }));
  }

  if (!posts || posts.length === 0) {
    return [];
  }

  // Filter posts that have text content
  const postsToAnalyze = posts.filter(
    (p) => p.content?.text || p.text || p.content?.description
  );

  if (postsToAnalyze.length === 0) {
    // Return neutral sentiment for posts without text
    return posts.map((p) => ({
      ...p,
      sentiment: "neutral",
      sentimentScore: 0.5,
    }));
  }

  try {
    // Process in batches to avoid token limits
    const batches = [];
    for (let i = 0; i < postsToAnalyze.length; i += BATCH_SIZE) {
      batches.push(postsToAnalyze.slice(i, i + BATCH_SIZE));
    }

    const allResults = [];

    for (const batch of batches) {
      const prompt = `Analyze the sentiment of these social media posts. Return ONLY a JSON array with sentiment analysis for each post. Format: [{"index": 0, "sentiment": "positive|neutral|negative", "score": 0.0-1.0}, ...]

Posts:
${batch
  .map(
    (p, i) =>
      `${i}. ${(p.content?.text || p.text || p.content?.description || "").slice(0, 200)}`
  )
  .join("\n")}

Return ONLY the JSON array, no other text.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Gemini API error:", errorData);
        throw new Error(
          `Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`
        );
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!text) {
        throw new Error("No response text from Gemini API");
      }

      // Clean and parse JSON response
      const cleanText = text.replace(/```json|```/g, "").trim();
      let sentimentResults;
      try {
        sentimentResults = JSON.parse(cleanText);
      } catch (parseError) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          sentimentResults = JSON.parse(jsonMatch[0]);
        } else {
          throw parseError;
        }
      }

      // Map results back to batch posts
      const batchStartIndex = allResults.length;
      const batchResults = batch.map((post, batchIndex) => {
        const result = sentimentResults.find(
          (r) => r.index === batchIndex
        );
        return {
          post,
          sentiment: result?.sentiment || "neutral",
          sentimentScore: result?.score || 0.5,
        };
      });

      allResults.push(...batchResults);

      // Add small delay between batches to avoid rate limiting
      if (batches.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Map results back to all posts (including those without text)
    const resultMap = new Map();
    let analyzedIndex = 0;

    postsToAnalyze.forEach((post) => {
      const result = allResults[analyzedIndex];
      if (result) {
        resultMap.set(post._id?.toString() || post.id, {
          sentiment: result.sentiment,
          sentimentScore: result.sentimentScore,
        });
        analyzedIndex++;
      }
    });

    return posts.map((post) => {
      const postId = post._id?.toString() || post.id;
      const analysis = resultMap.get(postId);
      if (analysis) {
        return {
          ...post,
          sentiment: analysis.sentiment,
          sentimentScore: analysis.sentimentScore,
        };
      }
      // Post wasn't analyzed (no text), return neutral
      return {
        ...post,
        sentiment: "neutral",
        sentimentScore: 0.5,
      };
    });
  } catch (error) {
    console.error("Sentiment analysis failed:", error);
    // Return neutral sentiment on error
    return posts.map((p) => ({
      ...p,
      sentiment: "neutral",
      sentimentScore: 0.5,
    }));
>>>>>>> 0c707fb6555ffe0f10bfa9de4dfe43dda32fec28
  }
};

/**
 * Save sentiment analysis results to database
<<<<<<< HEAD
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
=======
 * @param {Array} analyzedPosts - Array of posts with sentiment analysis
 * @returns {Promise<Object>} Update result
 */
export const saveSentimentToDB = async (analyzedPosts) => {
  if (!analyzedPosts || analyzedPosts.length === 0) {
    return { updated: 0 };
  }

  try {
    const updatePromises = analyzedPosts.map((post) => {
      if (!post._id && !post.id) {
        return null;
      }

      const updateData = {
        sentiment: post.sentiment || "neutral",
        sentimentScore: post.sentimentScore || 0.5,
        sentimentAnalyzedAt: new Date(),
      };

      // Also update analysis.sentiment for backward compatibility
      if (post.analysis) {
        updateData["analysis.sentiment"] = post.sentiment || "neutral";
      }

      return SocialPost.findByIdAndUpdate(
        post._id || post.id,
        { $set: updateData },
        { new: true }
      );
    });

    const results = await Promise.all(
      updatePromises.filter((p) => p !== null)
    );

    return {
      updated: results.length,
      success: true,
    };
  } catch (error) {
    console.error("Error saving sentiment to DB:", error);
    throw error;
>>>>>>> 0c707fb6555ffe0f10bfa9de4dfe43dda32fec28
  }
};

/**
<<<<<<< HEAD
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
=======
 * Check which posts need sentiment analysis
 * @param {Array} posts - Array of posts to check
 * @returns {Object} Object with postsToAnalyze and postsWithSentiment
 */
export const checkSentimentStatus = (posts) => {
  const postsToAnalyze = [];
  const postsWithSentiment = [];

  posts.forEach((post) => {
    const hasText = post.content?.text || post.text || post.content?.description;
    const hasSentiment = post.sentiment && post.sentimentAnalyzedAt;

    if (hasText && !hasSentiment) {
      postsToAnalyze.push(post);
    } else if (hasSentiment) {
      postsWithSentiment.push(post);
    } else {
      // No text, assign neutral
      postsWithSentiment.push({
        ...post,
        sentiment: "neutral",
        sentimentScore: 0.5,
      });
    }
  });

  return {
    postsToAnalyze,
    postsWithSentiment,
  };
>>>>>>> 0c707fb6555ffe0f10bfa9de4dfe43dda32fec28
};

