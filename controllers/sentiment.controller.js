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
  }
};

/**
 * Save sentiment analysis results to database
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
  }
};

/**
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
};

