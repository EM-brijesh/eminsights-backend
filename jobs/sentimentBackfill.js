import { SocialPost } from "../models/data.js";
import { analyzePostsSentiment } from "../services/sentiment.service.js";

const DEFAULT_BACKFILL_LIMIT = Number(process.env.SENTIMENT_BACKFILL_LIMIT || 500);
const DEFAULT_BACKFILL_BATCH_SIZE = Number(process.env.SENTIMENT_BACKFILL_BATCH || 50);
// No rate limiting needed for local model - can process faster
const DEFAULT_BACKFILL_CONCURRENCY = Number(process.env.SENTIMENT_BACKFILL_CONCURRENCY || 10);

const buildSentimentPayload = (post = {}) => {
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
};

export const runSentimentBackfill = async ({
  limit = DEFAULT_BACKFILL_LIMIT,
  batchSize = DEFAULT_BACKFILL_BATCH_SIZE,
  concurrency = DEFAULT_BACKFILL_CONCURRENCY,
  brandId,
  platform,
} = {}) => {
  const filter = {
    $or: [{ sentiment: { $exists: false } }, { sentiment: null }],
  };

  if (brandId) filter.brand = brandId;
  if (platform) filter.platform = platform;

  console.log(
    `[Sentiment Backfill] scanning for posts (limit=${limit}, batchSize=${batchSize}, brandId=${
      brandId || "all"
    }, platform=${platform || "all"})`
  );

  const postsToAnalyze = await SocialPost.find(filter)
    .limit(limit)
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

  if (!postsToAnalyze.length) {
    return { total: 0, analyzed: 0, saved: 0 };
  }

  let analyzedCount = 0;
  let savedCount = 0;

  for (let i = 0; i < postsToAnalyze.length; i += batchSize) {
    const batch = postsToAnalyze.slice(i, i + batchSize).map(buildSentimentPayload);
    const batchNumber = Math.floor(i / batchSize) + 1;
    console.log(`[Sentiment Backfill] analyzing batch ${batchNumber} (${batch.length} posts)`);

    try {
      const {
        results: analyzedBatch = [],
        successful: successfulCount = 0,
        errors: batchErrors = [],
      } = await analyzePostsSentiment(batch, { concurrency: concurrency || DEFAULT_BACKFILL_CONCURRENCY });

      analyzedCount += successfulCount;

      if (batchErrors.length > 0) {
        console.warn(
          `[Sentiment Backfill] batch ${batchNumber} encountered ${batchErrors.length} errors`
        );
      }

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
        } catch (updateErr) {
          console.error(`Sentiment backfill save failed for ${post._id}:`, updateErr.message);
        }
      }
    } catch (batchErr) {
      console.error(`[Sentiment Backfill] batch ${batchNumber} failed:`, batchErr.message);
    }
  }

  console.log(
    `[Sentiment Backfill] completed run → total=${postsToAnalyze.length}, analyzed=${analyzedCount}, saved=${savedCount}`
  );

  return {
    total: postsToAnalyze.length,
    analyzed: analyzedCount,
    saved: savedCount,
  };
};

