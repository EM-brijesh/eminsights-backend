// controllers/search.brand.controller.js
import { Brand } from "../models/brand.js";
import { SocialPost } from "../models/data.js";
import { fetchYouTubeSearch } from "../services/youtube.service.js";
import { fetchTwitterSearch } from "../services/twitter.service.js";
import { fetchRedditSearch } from "../services/reddit.service.js";
import { scheduleKeywordGroup } from "../utils/cronManager.js";
import { fetchGoogleSearch } from "../services/google.service.js";
import { analyzePostsSentiment } from "../services/sentiment.service.js";
import { fetchInstagramSearch } from "../services/instagramFetcher.js";
import { fetchFacebookPublicPosts, fetchPostsForPageAndGroup } from "../services/fbpublicpagefetcher.js";

const REALTIME_PLATFORM_FETCHERS = {
  youtube: fetchYouTubeSearch,
  twitter: fetchTwitterSearch,
  reddit: fetchRedditSearch,
  google: fetchGoogleSearch,
  instagram: fetchInstagramSearch,
  facebook: fetchFacebookPublicPosts
};

const SUPPORTED_REALTIME_PLATFORMS = Object.keys(REALTIME_PLATFORM_FETCHERS);

const deriveGroupExecutions = (brand) => {
  const fallbackLanguage = brand.language || "en";
  const fallbackCountry = brand.country || "IN";
  const fallbackInclude = Array.isArray(brand.includeKeywords) ? brand.includeKeywords : [];
  const fallbackExclude = Array.isArray(brand.excludeKeywords) ? brand.excludeKeywords : [];
  const fallbackPlatforms = Array.isArray(brand.platforms) ? brand.platforms : [];

  const normalizeGroup = (rawGroup) => {
    const group = typeof rawGroup.toObject === "function" ? rawGroup.toObject() : rawGroup;
    const keywords = Array.isArray(group.keywords) ? group.keywords.filter(Boolean) : [];
    const includeKeywords = Array.isArray(group.includeKeywords) && group.includeKeywords.length > 0 ? group.includeKeywords : fallbackInclude;
    const excludeKeywords = Array.isArray(group.excludeKeywords) && group.excludeKeywords.length > 0 ? group.excludeKeywords : fallbackExclude;
    const platforms = (Array.isArray(group.platforms) && group.platforms.length > 0 ? group.platforms : fallbackPlatforms).filter((platform) =>
      SUPPORTED_REALTIME_PLATFORMS.includes(platform)
    );

    return {
      id: String(group._id || group.id || `${group.groupName || group.name || "group"}-${Math.random()}`),
      name: group.groupName || group.name || "Default Group",
      keywords,
      includeKeywords,
      excludeKeywords,
      platforms,
      language: group.language || fallbackLanguage,
      country: group.country || fallbackCountry,
      paused: group.status === "paused" || group.paused === true,
    };
  };

  const keywordGroups = Array.isArray(brand.keywordGroups) ? brand.keywordGroups : [];
  if (keywordGroups.length > 0) {
    return keywordGroups.map(normalizeGroup).filter((group) => !group.paused && group.keywords.length > 0 && group.platforms.length > 0);
  }

  const brandKeywords = Array.isArray(brand.keywords) ? brand.keywords.filter(Boolean) : [];
  const brandPlatforms = fallbackPlatforms.filter((platform) => SUPPORTED_REALTIME_PLATFORMS.includes(platform));

  if (brandKeywords.length > 0 && brandPlatforms.length > 0) {
    return [
      {
        id: "brand-default",
        name: brand.brandName,
        keywords: brandKeywords,
        includeKeywords: fallbackInclude,
        excludeKeywords: fallbackExclude,
        platforms: brandPlatforms,
        language: fallbackLanguage,
        country: fallbackCountry,
        paused: false,
      },
    ];
  }

  return [];
};

/**
 * Analyze posts with sentiment before saving to database
 * Processes ALL posts synchronously with no limits
 * @param {Array} posts - Array of post objects to analyze
 * @returns {Promise<Array>} - Posts with sentiment data merged
 */
const analyzePostsBeforeSave = async (posts) => {
  if (!Array.isArray(posts) || posts.length === 0) {
    return posts;
  }

  try {
    console.log(`Analyzing ${posts.length} posts for sentiment before saving...`);

    // Analyze all posts with no limits - process entire array
    const analysisResult = await analyzePostsSentiment(posts, {
      concurrency: 5, // Default concurrency
    });

    const analyzedPosts = analysisResult.results || [];
    const analyzedCount = analysisResult.successful || 0;
    const failedCount = analysisResult.failed || 0;
    const errors = analysisResult.errors || [];

    console.log(`Sentiment analysis completed: ${analyzedCount} successful, ${failedCount} failed out of ${posts.length} total`);

    // Log detailed failure statistics
    if (errors.length > 0) {
      const failuresByPlatform = {};
      const failuresByError = {};
      errors.forEach((err) => {
        const platform = err.platform || 'unknown';
        const errorType = err.error || 'UNKNOWN';
        failuresByPlatform[platform] = (failuresByPlatform[platform] || 0) + 1;
        failuresByError[errorType] = (failuresByError[errorType] || 0) + 1;
      });
      console.log(`Failures by platform:`, failuresByPlatform);
      console.log(`Failures by error type:`, failuresByError);

      // Log sample errors for debugging
      const sampleErrors = errors.slice(0, 5);
      console.log(`Sample errors (first 5):`, sampleErrors.map(e => ({
        platform: e.platform,
        error: e.error,
        hasText: e.hasText,
        textLength: e.textLength,
      })));
    }

    // Use index-based matching since analyzePostsSentiment returns results in the same order as input
    // This is more reliable than ID matching for new posts that don't have _id yet
    return posts.map((post, index) => {
      const analyzed = analyzedPosts[index];

      // If we have an analyzed result at this index, merge sentiment data
      if (analyzed && analyzed.sentiment) {
        return {
          ...post,
          sentiment: analyzed.sentiment || null,
          sentimentScore: analyzed.sentimentScore || null,
          sentimentConfidence: analyzed.sentimentConfidence || null,
          sentimentAnalyzedAt: analyzed.sentimentAnalyzedAt || new Date(),
          sentimentSource: analyzed.sentimentSource || null,
          sentimentExplanation: analyzed.sentimentExplanation || null,
          language: analyzed.language || null,
          analysis: {
            ...(post.analysis || {}),
            sentiment: analyzed.sentiment || null,
            sentimentConfidence: analyzed.sentimentConfidence || null,
            sentimentSource: analyzed.sentimentSource || null,
            sentimentExplanation: analyzed.sentimentExplanation || null,
            processingTimeMs: analyzed.processingTimeMs || null,
          },
        };
      }

      // If analysis failed or returned null sentiment, log it but still return the post
      if (analyzed && analyzed.sentimentError) {
        const textPreview = (post.content?.text || post.content?.title || post.text || post.title || '').substring(0, 100);
        console.warn(`Post analysis failed at index ${index}:`, {
          platform: post.platform,
          keyword: post.keyword,
          error: analyzed.sentimentError,
          errorMessage: analyzed.sentimentError?.message || analyzed.errorMessage,
          hasText: !!(post.content?.text || post.content?.title || post.text || post.title),
          textLength: textPreview.length,
          textPreview: textPreview || '(no text)',
        });
      } else if (!analyzed) {
        // Post wasn't in results array (shouldn't happen, but log if it does)
        console.warn(`Post at index ${index} was not in analysis results:`, {
          platform: post.platform,
          keyword: post.keyword,
        });
      }

      // Return original post (with null sentiment) if analysis failed or wasn't found
      return post;
    });
  } catch (error) {
    console.error("Error analyzing posts for sentiment:", error);
    // Return original posts if analysis fails - don't block database insertion
    return posts;
  }
};



//keyword-toggler
export const toggleKeywordGroupStatus = async (req, res) => {
  try {
    const { brandName, groupName, action } = req.body;

    if (!brandName || !groupName || !action) {
      return res.status(400).json({
        success: false,
        message: "brandName, groupName, and action are required",
      });
    }

    const brand = await Brand.findOne({ brandName });
    if (!brand) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    const group = brand.keywordGroups.find(
      (g) => g.groupName.toLowerCase() === groupName.toLowerCase()
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: `Keyword group "${groupName}" not found`,
      });
    }

    if (action === "start") {
      group.status = "running";
      group.paused = false;
    } else if (action === "pause") {
      group.status = "paused";
      group.paused = true;
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Use 'start' or 'pause'.",
      });
    }

    await brand.save();
    await scheduleKeywordGroup(brand, group);

    return res.json({
      success: true,
      message: `Group '${groupName}' is now ${group.status}`,
      status: group.status,
      paused: group.paused,
    });

  } catch (err) {
    console.error("Toggle Group Status Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


//for keyword specific search
export const runKeywordGroupSearch = async (req, res) => {
  try {
    const { brandName, groupName } = req.body;

    if (!brandName) {
      return res.status(400).json({ success: false, message: "brandName is required" });
    }

    if (!groupName) {
      return res.status(400).json({ success: false, message: "groupName is required" });
    }

    const brand = await Brand.findOne({ brandName });
    if (!brand) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    const group = brand.keywordGroups.find(
      (g) => g.groupName.toLowerCase() === groupName.toLowerCase()
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: `Keyword group "${groupName}" not found`,
      });
    }

    if (group.status === "paused" || group.paused === true) {
      return res.status(400).json({
        success: false,
        message: `Keyword group "${groupName}" is paused`,
      });
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔍 KEYWORD GROUP SEARCH DEBUG");
    console.log("Brand:", brand.brandName);
    console.log("Group:", group.groupName);
    console.log("Platforms in group:", group.platforms);
    console.log("Keywords:", group.keywords);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const now = new Date();
    const startDate = new Date(now.getTime() - 60 * 60 * 1000);
    const endDate = new Date(now.getTime() - 10 * 1000);

    const summary = SUPPORTED_REALTIME_PLATFORMS.reduce(
      (acc, platform) => ({ ...acc, [platform]: 0 }),
      {}
    );

    const postsToInsert = [];

    // 🔁 Loop platforms
    for (const platform of group.platforms) {
      console.log(`\n📱 Processing platform: ${platform}`);

      // 🟣 FACEBOOK (Page-driven special handling)
      if (platform === "facebook") {
        console.log("🟣 Running Facebook page-driven fetch...");
        try {
          const saved = await fetchPostsForPageAndGroup(brand, group);
          summary["facebook"] = saved || 0;
        } catch (fbErr) {
          console.error("❌ Facebook fetch error:", fbErr.message);
        }
        continue;
      }

      // 🔵 Other platforms (keyword-driven)
      const fetcher = REALTIME_PLATFORM_FETCHERS[platform];

      if (!fetcher) {
        console.log(`❌ No fetcher found for platform: ${platform}`);
        continue;
      }

      console.log(`✅ Fetcher found for ${platform}`);

      // Loop keywords
      for (const keyword of group.keywords) {
        console.log(`\n  🔑 Keyword: "${keyword}" on ${platform}`);

        let fetchedData = [];

        try {
          console.log(`  ⏳ Calling fetcher for ${platform}...`);

          fetchedData = await fetcher(keyword, {
            include: group.includeKeywords,
            exclude: group.excludeKeywords,
            language: group.language,
            country: group.country,
            startDate,
            endDate,
            brand,
            group,
          });

          console.log(`  ✅ Fetched ${fetchedData.length} posts from ${platform}`);
        } catch (fetchErr) {
          console.error(`  ❌ Group Fetch Error [${platform}]`, {
            brand: brand.brandName,
            group: group.groupName,
            keyword,
            error: fetchErr.message,
            stack: fetchErr.stack,
          });
          continue;
        }

        summary[platform] += fetchedData.length;

        if (fetchedData.length > 0) {
          const docs = fetchedData.map((item) => {
            // ✅ Base fields common to all platforms
            const doc = {
              brand: brand._id,
              keyword,
              platform,
              groupId: group._id,
              groupName: group.groupName,
              createdAt: new Date(item.createdAt || item.publishedAt || Date.now()),
              fetchedAt: new Date(),
            };

            // ✅ All platforms — fetcher already returns schema-shaped fields
            doc.sourceUrl = item.sourceUrl || item.tweetUrl || undefined;
            doc.author = item.author || {};
            doc.content = item.content || {};

            doc.metrics = {
              likes: item.metrics?.likes || 0,
              comments: item.metrics?.comments || 0,
              shares: item.metrics?.shares || 0,
              views: item.metrics?.views || 0,
            };

            doc.location = item.location || null;

            return doc;
          });

          console.log(`  📝 Sample doc for ${platform}:`, JSON.stringify(docs[0], null, 2));

          postsToInsert.push(...docs);
        }
      }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 FETCH SUMMARY:");
    console.log(JSON.stringify(summary, null, 2));
    console.log("Total posts to insert:", postsToInsert.length);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // 🔎 Sentiment analysis
    let analyzedPosts = postsToInsert;
    let analyzedCount = 0;
    let failedCount = 0;
    const totalScraped = postsToInsert.length;

    if (postsToInsert.length > 0) {
      analyzedPosts = await analyzePostsBeforeSave(postsToInsert);
      analyzedCount = analyzedPosts.filter((p) => p.sentiment).length;
      failedCount = totalScraped - analyzedCount;
    }

    let savedCount = 0;
    let duplicateCount = 0;

    if (analyzedPosts.length > 0) {
      console.log("📝 Attempting to save", analyzedPosts.length, "posts...");
      console.log("📝 sourceUrls:", analyzedPosts.map(p => ({
        platform: p.platform,
        sourceUrl: p.sourceUrl
      })));

      try {
        const result = await SocialPost.insertMany(analyzedPosts, {
          ordered: false,
          rawResult: true,
        });

        console.log("✅ insertMany SUCCESS");
        console.log("✅ insertedCount:", result.insertedCount);
        console.log("✅ insertedIds:", JSON.stringify(result.insertedIds, null, 2));
        savedCount = result.insertedCount || analyzedPosts.length;

      } catch (saveError) {
        console.error("❌ SAVE ERROR NAME:", saveError.name);
        console.error("❌ SAVE ERROR CODE:", saveError.code);
        console.error("❌ nInserted:", saveError.result?.nInserted ?? "undefined");
        console.error("❌ writeErrors count:", saveError.writeErrors?.length ?? 0);
        console.error("❌ writeErrors detail:", JSON.stringify(
          saveError.writeErrors?.slice(0, 3).map(e => ({
            code: e.code,
            index: e.index,
            errmsg: e.errmsg,
            sourceUrl: analyzedPosts[e.index]?.sourceUrl,
            platform: analyzedPosts[e.index]?.platform,
          })), null, 2
        ));

        if (saveError.code === 11000 || saveError.name === "MongoBulkWriteError") {
          savedCount = saveError.result?.nInserted ?? 0;
          duplicateCount = saveError.writeErrors?.filter(e => e.code === 11000).length ?? 0;
          console.log(`⚠️ Duplicate run result: saved=${savedCount}, duplicates=${duplicateCount}`);
        } else {
          console.error("❌ NON-DUPLICATE ERROR:", saveError.message);
          console.error("❌ FULL STACK:", saveError.stack);
        }
      }
    }

    res.json({
      success: true,
      brandName: brand.brandName,
      groupName: group.groupName,
      keywordsExecuted: group.keywords.length,
      fetched: totalScraped,
      summary,
      sentimentAnalysis: {
        totalScraped,
        analyzed: analyzedCount,
        failed: failedCount,
      },
      saved: savedCount,
      duplicates: duplicateCount,
      totalAttempted: analyzedPosts.length,
    });
  } catch (err) {
    console.error("Group Search Run Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
