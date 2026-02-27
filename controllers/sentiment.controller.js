import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SocialPost } from "../models/data.js";
import { SentimentChangeLog } from "../models/sentimentChangeLog.js";
import { Brand } from "../models/brand.js";
import { analyzePostsSentiment } from "../services/sentiment.service.js";

const { promises: fsPromises } = fs;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_DIR = path.resolve(__dirname, "..", "reports");
const DIAGNOSTICS_LOG_PATH = path.join(
  REPORT_DIR,
  "sentiment-diagnostics.log"
);
const DIAGNOSTICS_SAMPLE_LIMIT = 8;

const extractSnippet = (post) =>
  (post?.content?.text ||
    post?.content?.description ||
    post?.text ||
    post?.title ||
    "")
    .trim()
    .slice(0, 160);

const createDiagnosticsAccumulator = (limit = DIAGNOSTICS_SAMPLE_LIMIT) => ({
  total: 0,
  counts: {
    positive: 0,
    neutral: 0,
    negative: 0,
    pending: 0,
  },
  fallbackCount: 0,
  lexicalCount: 0,
  scoredSum: 0,
  scoredCount: 0,
  fallbackSamples: [],
  lexicalSamples: [],
  limit,
});

const normalizeSampleLimit = (value) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(50, Math.max(1, Math.floor(parsed)));
  }
  return DIAGNOSTICS_SAMPLE_LIMIT;
};

const accumulateDiagnostics = (accumulator, posts = []) => {
  posts.forEach((post) => {
    const sentiment = post.sentiment || "pending";
    const score = typeof post.sentimentScore === "number" ? post.sentimentScore : null;
    const source = post.sentimentSource || "unknown";
    const snippet = extractSnippet(post);

    accumulator.total += 1;
    accumulator.counts[sentiment] = (accumulator.counts[sentiment] || 0) + 1;

    if (score !== null) {
      accumulator.scoredSum += score;
      accumulator.scoredCount += 1;
    }

    if (post.sentimentFallback) {
      accumulator.fallbackCount += 1;
      if (accumulator.fallbackSamples.length < accumulator.limit) {
        accumulator.fallbackSamples.push({
          id: String(post._id || post.id || ""),
          platform: post.platform,
          sentiment,
          score,
          reason: post.analysis?.sentimentFallbackReason || [],
          snippet,
        });
      }
    }

    if (
      source?.includes("heuristic") &&
      accumulator.lexicalSamples.length < accumulator.limit
    ) {
      accumulator.lexicalCount += 1;
      accumulator.lexicalSamples.push({
        id: String(post._id || post.id || ""),
        platform: post.platform,
        sentiment,
        score,
        heuristic: post.analysis?.heuristicMeta || null,
        snippet,
      });
    } else if (source?.includes("heuristic")) {
      accumulator.lexicalCount += 1;
    }
  });

  return accumulator;
};

const finalizeDiagnostics = (accumulator) => {
  if (!accumulator || accumulator.total === 0) {
    return {
      total: 0,
      counts: accumulator?.counts || { positive: 0, neutral: 0, negative: 0, pending: 0 },
      averageScore: null,
      neutralRatio: 0,
      fallbackRatio: 0,
      lexicalRatio: 0,
      fallbackSamples: [],
      lexicalSamples: [],
    };
  }

  const averageScore =
    accumulator.scoredCount > 0
      ? Number((accumulator.scoredSum / accumulator.scoredCount).toFixed(3))
      : null;

  const ratio = (value) =>
    Number((value / Math.max(1, accumulator.total)).toFixed(3));

  return {
    total: accumulator.total,
    counts: accumulator.counts,
    averageScore,
    neutralRatio: ratio(accumulator.counts.neutral || 0),
    fallbackRatio: ratio(accumulator.fallbackCount),
    lexicalRatio: ratio(accumulator.lexicalCount),
    fallbackSamples: accumulator.fallbackSamples,
    lexicalSamples: accumulator.lexicalSamples,
  };
};

const persistDiagnosticsLog = async (payload) => {
  try {
    await fsPromises.mkdir(REPORT_DIR, { recursive: true });
    await fsPromises.appendFile(
      DIAGNOSTICS_LOG_PATH,
      `${JSON.stringify(payload)}\n`,
      "utf8"
    );
  } catch (error) {
    console.error("Failed to write sentiment diagnostics log:", error.message);
  }
};

/**
 * POST /api/sentiment/check
 * Determine which posts already have stored sentiment data
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

    const rawIds = posts
      .map((post) => post._id || post.id)
      .filter(Boolean);

    if (rawIds.length === 0) {
      return res.json({
        success: true,
        postsWithSentiment: [],
        postsToAnalyze: posts,
      });
    }

    const objectIds = [];
    rawIds.forEach((id) => {
      try {
        objectIds.push(new mongoose.Types.ObjectId(id));
      } catch {
        // Ignore ids that cannot be converted; they'll stay in postsToAnalyze
      }
    });

    const postsWithSentiment = await SocialPost.find({
      _id: { $in: objectIds },
      sentiment: { $exists: true, $ne: null },
    }).lean();

    const postsWithSentimentIds = new Set(
      postsWithSentiment.map((p) => String(p._id))
    );

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
 * POST /api/sentiment/analyze
 * Run sentiment analysis for the provided posts
 */
export const analyzeSentiment = async (req, res) => {
  try {
    const {
      posts,
      includeDiagnostics = false,
      diagnosticsTag = "manual-run",
      diagnosticsSampleLimit,
    } = req.body;

    if (!Array.isArray(posts) || posts.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    // No rate limit needed for local model - can process larger batches
    // Still enforce a reasonable limit to prevent timeouts
    const MAX_POSTS_PER_REQUEST = 100;
    if (posts.length > MAX_POSTS_PER_REQUEST) {
      return res.status(400).json({
        success: false,
        message: `Too many posts for synchronous analysis. Maximum limit is ${MAX_POSTS_PER_REQUEST} posts per request.`,
      });
    }

    const analysisResult = await analyzePostsSentiment(posts, { concurrency: 10 });
    const analyzedPosts = analysisResult.results || analysisResult || [];
    let diagnostics = null;

    if (includeDiagnostics) {
      const accumulator = createDiagnosticsAccumulator(
        normalizeSampleLimit(diagnosticsSampleLimit)
      );
      accumulateDiagnostics(accumulator, analyzedPosts);
      diagnostics = finalizeDiagnostics(accumulator);
      await persistDiagnosticsLog({
        timestamp: new Date().toISOString(),
        source: "analyzeSentiment",
        tag: diagnosticsTag,
        sampleLimit: accumulator.limit,
        summary: diagnostics,
      });
    }

    res.json({
      success: true,
      data: analyzedPosts,
      diagnostics,
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
 * POST /api/sentiment/save
 * Persist analyzed sentiment outputs to MongoDB
 */
const applySentimentUpdate = async (postId, sentimentPayload, options = {}) => {
  if (!postId) {
    throw new Error("Post ID is required");
  }

  const {
    sentimentSource = null,
    markManual = false,
  } = options || {};

  const $set = {
    sentiment: sentimentPayload.sentiment || null,
    sentimentScore:
      typeof sentimentPayload.sentimentScore === "number"
        ? sentimentPayload.sentimentScore
        : sentimentPayload.sentimentScore || null,
    sentimentAnalyzedAt:
      sentimentPayload.sentimentAnalyzedAt || new Date(),
    "analysis.sentiment": sentimentPayload.sentiment || null,
  };

  if (sentimentSource) {
    $set.sentimentSource = sentimentSource;
  }

  if (markManual) {
    $set.sentimentIsManual = true;
  } else if (typeof sentimentPayload.sentimentIsManual === "boolean") {
    $set.sentimentIsManual = sentimentPayload.sentimentIsManual;
  }

  if (sentimentPayload.language) {
    $set.language = sentimentPayload.language;
  }

  await SocialPost.updateOne({ _id: postId }, { $set });
};

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

    for (const post of posts) {
      const postId = post._id || post.id;
      if (!postId) continue;

      try {
        await applySentimentUpdate(
          postId,
          {
            sentiment: post.sentiment,
            sentimentScore: post.sentimentScore,
            sentimentAnalyzedAt: post.sentimentAnalyzedAt,
            sentimentIsManual: post.sentimentIsManual,
            language: post.language || undefined,
          },
          {
            // Automated saves should not mark manual; allow caller to override via payload
            sentimentSource: post.sentimentSource || undefined,
          },
        );
        savedCount++;
      } catch (updateError) {
        console.error(
          `Failed to save sentiment for post ${postId}:`,
          updateError.message,
        );
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

export const updateManualSentiment = async (req, res) => {
  try {
    const { postId, sentiment } = req.body || {};
    const allowed = ["positive", "neutral", "negative"];

    if (!postId) {
      return res.status(400).json({
        success: false,
        message: "postId is required",
      });
    }

    if (!sentiment || !allowed.includes(String(sentiment).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "sentiment must be one of: positive, neutral, negative",
      });
    }

    const normalizedSentiment = String(sentiment).toLowerCase();
    const existing = await SocialPost.findById(postId)
      .select({ sentiment: 1 })
      .lean();

    await applySentimentUpdate(
      postId,
      {
        sentiment: normalizedSentiment,
      },
      {
        sentimentSource: "manual",
        markManual: true,
      },
    );

    try {
      await SentimentChangeLog.create({
        post: postId,
        oldSentiment: existing?.sentiment ?? null,
        newSentiment: normalizedSentiment,
        user: req.user?._id || null,
        changedAt: new Date(),
      });
    } catch (logError) {
      console.error("Failed to write sentiment change log:", logError.message);
    }

    res.json({
      success: true,
      data: {
        postId,
        oldSentiment: existing?.sentiment ?? null,
        sentiment: normalizedSentiment,
        sentimentSource: "manual",
        sentimentAnalyzedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Update manual sentiment error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update sentiment manually",
    });
  }
};

/**
 * POST /api/sentiment/batch-analyze
 * Analyze batches of posts that are missing sentiment data
 */
export const batchAnalyzeSentiment = async (req, res) => {
  try {
    const {
      brandName,
      platform,
      limit = 100,
      batchSize = 5,
      includeDiagnostics = false,
      diagnosticsTag = "batch-run",
      diagnosticsSampleLimit,
    } = req.body;

    const filter = {
      $or: [
        { sentiment: { $exists: false } },
        { sentiment: null },
      ],
    };

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

    if (platform) {
      filter.platform = platform;
    }

    const postsToAnalyze = await SocialPost.find(filter)
      .limit(Number(limit))
      .select({
        _id: 1,
        platform: 1,
        keyword: 1,
        brand: 1,
        brandName: 1,
        content: 1,
        text: 1,
        title: 1,
        summary: 1,
      })
      .lean();

    if (postsToAnalyze.length === 0) {
      return res.json({
        success: true,
        message: "No posts found without sentiment analysis",
        analyzed: 0,
        total: 0,
      });
    }

    console.log(
      `Starting batch sentiment analysis for ${postsToAnalyze.length} posts...`
    );

    let analyzedCount = 0;
    let savedCount = 0;
    const diagnosticsAccumulator = includeDiagnostics
      ? createDiagnosticsAccumulator(normalizeSampleLimit(diagnosticsSampleLimit))
      : null;

    for (let i = 0; i < postsToAnalyze.length; i += batchSize) {
      const batch = postsToAnalyze.slice(i, i + batchSize).map((post) => {
        const baseText =
          post?.content?.text ||
          post?.content?.description ||
          post?.text ||
          post?.summary ||
          "";

        return {
          ...post,
          content: {
            text: baseText,
            description: post?.content?.description || null,
            title: post?.content?.title || post?.title || "",
          },
        };
      });

      try {
        const analyzedBatch = await analyzePostsSentiment(batch, 5);
        analyzedCount += analyzedBatch.length;

        if (includeDiagnostics) {
          accumulateDiagnostics(diagnosticsAccumulator, analyzedBatch);
        }

        for (const post of analyzedBatch) {
          try {
            await SocialPost.updateOne(
              { _id: post._id },
              {
                $set: {
                  sentiment: post.sentiment || null,
                  sentimentScore: post.sentimentScore || null,
                  sentimentAnalyzedAt:
                    post.sentimentAnalyzedAt || new Date(),
                  "analysis.sentiment": post.sentiment || null,
                },
              }
            );
            savedCount++;
          } catch (updateError) {
            console.error(
              `Failed to save sentiment for post ${post._id}:`,
              updateError.message
            );
          }
        }

        console.log(
          `Processed batch ${Math.floor(i / batchSize) + 1}: ${analyzedBatch.length
          } posts analyzed`
        );
      } catch (batchError) {
        console.error(
          `Error processing batch ${Math.floor(i / batchSize) + 1}:`,
          batchError.message
        );
      }
    }

    let diagnostics = null;
    if (includeDiagnostics && diagnosticsAccumulator) {
      diagnostics = finalizeDiagnostics(diagnosticsAccumulator);
      await persistDiagnosticsLog({
        timestamp: new Date().toISOString(),
        source: "batchAnalyzeSentiment",
        tag: diagnosticsTag,
        brandName: brandName || null,
        platform: platform || "all",
        sampleLimit: diagnosticsAccumulator.limit,
        limit,
        batchSize,
        summary: diagnostics,
        totalAnalyzed: analyzedCount,
      });
    }

    res.json({
      success: true,
      message: "Batch sentiment analysis completed",
      analyzed: analyzedCount,
      saved: savedCount,
      total: postsToAnalyze.length,
      diagnostics,
    });
  } catch (error) {
    console.error("Batch analyze sentiment error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /api/sentiment/summary
 * Return stored sentiment aggregates for dashboards
 */
export const getSentimentSummary = async (req, res) => {
  try {
    const { brandName, platform, keyword, startDate, endDate } = req.query || {};

    if (!brandName) {
      return res.status(400).json({
        success: false,
        message: "brandName query parameter is required",
      });
    }

    const brand = await Brand.findOne({ brandName });
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    const normalizeDate = (value) => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const matchStage = { brand: brand._id };
    const normalizedPlatform =
      typeof platform === "string" && platform !== "all"
        ? platform.toLowerCase()
        : null;
    if (normalizedPlatform) {
      matchStage.platform = normalizedPlatform;
    }

    const normalizedKeyword =
      typeof keyword === "string" && keyword !== "all"
        ? keyword.trim()
        : null;
    if (normalizedKeyword) {
      matchStage.keyword = normalizedKeyword;
    }

    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);
    if (start || end) {
      matchStage.createdAt = {};
      if (start) matchStage.createdAt.$gte = start;
      if (end) matchStage.createdAt.$lte = end;
    }

    const analyzedCondition = {
      $cond: [
        {
          $and: [{ $ifNull: ["$sentiment", false] }, { $ne: ["$sentiment", null] }],
        },
        1,
        0,
      ],
    };

    const sentimentScoreExpr = {
      $cond: [
        { $and: [{ $ifNull: ["$sentimentScore", false] }, { $ne: ["$sentimentScore", null] }] },
        "$sentimentScore",
        null,
      ],
    };

    const pipeline = [
      { $match: matchStage },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalPosts: { $sum: 1 },
                analyzedPosts: { $sum: analyzedCondition },
                avgSentimentScore: { $avg: sentimentScoreExpr },
                latestAnalyzedAt: { $max: "$sentimentAnalyzedAt" },
                earliestPostAt: { $min: "$createdAt" },
                latestPostAt: { $max: "$createdAt" },
              },
            },
          ],
          sentimentBreakdown: [
            {
              $group: {
                _id: {
                  $cond: [
                    {
                      $and: [
                        { $ifNull: ["$sentiment", false] },
                        { $ne: ["$sentiment", null] },
                      ],
                    },
                    "$sentiment",
                    "pending",
                  ],
                },
                count: { $sum: 1 },
              },
            },
          ],
          platformBreakdown: [
            {
              $group: {
                _id: "$platform",
                total: { $sum: 1 },
                positive: { $sum: { $cond: [{ $eq: ["$sentiment", "positive"] }, 1, 0] } },
                neutral: { $sum: { $cond: [{ $eq: ["$sentiment", "neutral"] }, 1, 0] } },
                negative: { $sum: { $cond: [{ $eq: ["$sentiment", "negative"] }, 1, 0] } },
                analyzed: { $sum: analyzedCondition },
                avgScore: { $avg: sentimentScoreExpr },
              },
            },
            {
              $project: {
                _id: 0,
                platform: { $ifNull: ["$_id", "unknown"] },
                total: 1,
                pending: { $max: [{ $subtract: ["$total", "$analyzed"] }, 0] },
                positive: 1,
                neutral: 1,
                negative: 1,
                analyzed: 1,
                avgScore: 1,
              },
            },
            { $sort: { total: -1 } },
          ],
          keywordBreakdown: [
            {
              $group: {
                _id: "$keyword",
                total: { $sum: 1 },
                positive: { $sum: { $cond: [{ $eq: ["$sentiment", "positive"] }, 1, 0] } },
                neutral: { $sum: { $cond: [{ $eq: ["$sentiment", "neutral"] }, 1, 0] } },
                negative: { $sum: { $cond: [{ $eq: ["$sentiment", "negative"] }, 1, 0] } },
                analyzed: { $sum: analyzedCondition },
              },
            },
            {
              $project: {
                _id: 0,
                keyword: { $ifNull: ["$_id", "unknown"] },
                total: 1,
                pending: { $max: [{ $subtract: ["$total", "$analyzed"] }, 0] },
                positive: 1,
                neutral: 1,
                negative: 1,
              },
            },
            { $sort: { total: -1 } },
            { $limit: 25 },
          ],
          languageBreakdown: [
            {
              $group: {
                _id: { $ifNull: ["$language", "undefined"] },
                count: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                language: "$_id",
                count: 1,
              },
            },
            { $sort: { count: -1 } },
            { $limit: 20 },
          ],
          timeline: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                positive: { $sum: { $cond: [{ $eq: ["$sentiment", "positive"] }, 1, 0] } },
                neutral: { $sum: { $cond: [{ $eq: ["$sentiment", "neutral"] }, 1, 0] } },
                negative: { $sum: { $cond: [{ $eq: ["$sentiment", "negative"] }, 1, 0] } },
                total: { $sum: 1 },
                pending: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ifNull: ["$sentiment", false] },
                          { $ne: ["$sentiment", null] },
                        ],
                      },
                      0,
                      1,
                    ],
                  },
                },
                avgScore: { $avg: sentimentScoreExpr },
              },
            },
            {
              $project: {
                _id: 0,
                date: "$_id",
                positive: 1,
                neutral: 1,
                negative: 1,
                total: 1,
                pending: 1,
                avgScore: 1,
              },
            },
            { $sort: { date: 1 } },
            { $limit: 90 },
          ],
        },
      },
    ];

    const [result] = await SocialPost.aggregate(pipeline);
    const totalsDoc = result?.totals?.[0] || {};

    const sentiment = { positive: 0, neutral: 0, negative: 0, pending: 0 };
    (result?.sentimentBreakdown || []).forEach((entry) => {
      const key = ["positive", "neutral", "negative"].includes(entry?._id)
        ? entry._id
        : entry?._id === "pending"
          ? "pending"
          : "neutral";
      sentiment[key] = entry?.count || 0;
    });

    const platforms = (result?.platformBreakdown || []).map((entry) => ({
      platform: entry.platform || "unknown",
      total: entry.total || 0,
      positive: entry.positive || 0,
      neutral: entry.neutral || 0,
      negative: entry.negative || 0,
      analyzed: entry.analyzed || 0,
      pending: entry.pending || Math.max((entry.total || 0) - (entry.analyzed || 0), 0),
      avgScore:
        typeof entry.avgScore === "number" ? entry.avgScore : null,
    }));

    const keywords = (result?.keywordBreakdown || []).map((entry) => ({
      keyword: entry.keyword || "unknown",
      total: entry.total || 0,
      positive: entry.positive || 0,
      neutral: entry.neutral || 0,
      negative: entry.negative || 0,
      pending: entry.pending || Math.max((entry.total || 0) - (entry.analyzed || 0), 0),
    }));

    const languages = (result?.languageBreakdown || []).map((entry) => ({
      language: entry.language || "undefined",
      count: entry.count || 0,
    }));

    const timeline = (result?.timeline || []).map((entry) => ({
      date: entry.date,
      positive: entry.positive || 0,
      neutral: entry.neutral || 0,
      negative: entry.negative || 0,
      total: entry.total || 0,
      pending: entry.pending || 0,
      avgScore:
        typeof entry.avgScore === "number" ? entry.avgScore : null,
    }));

    const totalPosts = totalsDoc.totalPosts || 0;
    const analyzedPosts = totalsDoc.analyzedPosts || 0;

    res.json({
      success: true,
      brand: brandName,
      filters: {
        brandName,
        platform: platform || "all",
        keyword: keyword || "all",
        startDate: startDate || null,
        endDate: endDate || null,
      },
      totals: {
        totalPosts,
        analyzedPosts,
        pendingPosts: Math.max(totalPosts - analyzedPosts, 0),
        avgSentimentScore:
          typeof totalsDoc.avgSentimentScore === "number"
            ? totalsDoc.avgSentimentScore
            : null,
        latestAnalyzedAt: totalsDoc.latestAnalyzedAt || null,
        earliestPostAt: totalsDoc.earliestPostAt || null,
        latestPostAt: totalsDoc.latestPostAt || null,
      },
      sentiment,
      platforms,
      keywords,
      languages,
      timeline,
    });
  } catch (error) {
    console.error("Get sentiment summary error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to build sentiment summary",
    });
  }
};

