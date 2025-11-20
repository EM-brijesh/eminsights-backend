// controllers/search.brand.controller.js
import { Brand } from "../models/brand.js";
import { SocialPost } from "../models/data.js";
import { fetchYouTubeSearch } from "../services/youtube.service.js";
import { fetchTwitterSearch } from "../services/twitter.service.js";
import { fetchRedditSearch } from "../services/reddit.service.js";
import { scheduleKeywordGroup } from "../utils/cronManager.js";

const REALTIME_PLATFORM_FETCHERS = {
  youtube: fetchYouTubeSearch,
  twitter: fetchTwitterSearch,
  reddit: fetchRedditSearch,
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

export const runSearchForBrand = async (req, res) => {
  try {
    const { brandName } = req.body;

    if (!brandName)
      return res.status(400).json({ success: false, message: "brandName is required" });

    const brand = await Brand.findOne({ brandName });
    if (!brand)
      return res.status(404).json({ success: false, message: "Brand not found" });

    const {
      keywords,
      includeKeywords = [],
      excludeKeywords = [],
      platforms,
      language,
      country,
    } = brand;

    if (!keywords.length)
      return res.status(400).json({ success: false, message: "No keywords configured for this brand" });
    if (!platforms.length)
      return res.status(400).json({ success: false, message: "No platforms configured for this brand" });

    const now = new Date();
    const startDate = new Date(now.getTime() - 60 * 60 * 1000); // last 1 hour
    const endDate = new Date(now.getTime() - 10 * 1000);

    const results = {};
    const saveOps = [];

    // Loop over all platforms
    for (const platform of platforms) {
      results[platform] = [];

      for (const keyword of keywords) {
        let fetchedData = [];

        if (platform === "youtube") {
          fetchedData = await fetchYouTubeSearch(keyword, {
            include: includeKeywords,
            exclude: excludeKeywords,
            language,
            country,
            startDate,
            endDate,
          });
        } else if (platform === "twitter") {
          fetchedData = await fetchTwitterSearch(keyword, {
            include: includeKeywords,
            exclude: excludeKeywords,
            language,
            country,
            startDate,
            endDate,
          });
        } else if (platform === "reddit") {
          fetchedData = await fetchRedditSearch(keyword, {
            include: includeKeywords,
            exclude: excludeKeywords,
            startDate,
            endDate,
          });
        }

        results[platform].push(...fetchedData);

        // Prepare for DB save
        if (fetchedData.length) {
          const docs = fetchedData.map((item) => ({
            ...item,
            brand: brand._id,
            brandName: brand.brandName,
            keyword,
            platform,
            createdAt: new Date(item.createdAt || item.publishedAt || Date.now()),
            fetchedAt: new Date(),
          }));
          saveOps.push(SocialPost.insertMany(docs, { ordered: false }));
        }
      }
    }

    await Promise.all(saveOps);

    res.json({
      success: true,
      brandName: brand.brandName,
      summary: {
        youtube: results.youtube?.length || 0,
        twitter: results.twitter?.length || 0,
        reddit: results.reddit?.length || 0,
      },
    });
  } catch (err) {
    console.error("Brand Search Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// search.controller.js
//frequency based api calling

// export const runSearchForGroup = async (req, res) => {
//   try {
//     const { brandName, groupId } = req.body;

//     const brand = await Brand.findOne({ brandName });
//     if (!brand)
//       return res.status(404).json({ success: false, message: "Brand not found" });

//     const group = brand.keywordGroups.id(groupId);
//     if (!group)
//       return res.status(404).json({ success: false, message: "Keyword Group not found" });

//     if (group.status === "paused")
//       return res.status(400).json({ success: false, message: "Group is paused" });

//     const {
//       keywords,
//       includeKeywords,
//       excludeKeywords,
//       platforms,
//       language,
//       country,
//     } = group;

//     const now = new Date();
//     const startDate = new Date(now.getTime() - 60 * 60 * 1000);
//     const endDate = new Date(now.getTime() - 10 * 1000);

//     const allPosts = [];

//     for (const platform of platforms) {
//       for (const keyword of keywords) {
//         let results = [];

//         if (platform === "youtube") {
//           results = await fetchYouTubeSearch(keyword, {
//             include: includeKeywords,
//             exclude: excludeKeywords,
//             language,
//             country,
//             startDate,
//             endDate,
//           });
//         }

//         if (platform === "twitter") {
//           results = await fetchTwitterSearch(keyword, {
//             include: includeKeywords,
//             exclude: excludeKeywords,
//             startDate,
//             endDate,
//           });
//         }

//         if (platform === "reddit") {
//           results = await fetchRedditSearch(keyword, {
//             include: includeKeywords,
//             exclude: excludeKeywords,
//             startDate,
//             endDate,
//           });
//         }

//         const docs = results.map((r) => ({
//           ...r,
//           brand: brand._id,
//           groupId: group._id,
//           platform,
//           keyword,
//           createdAt: new Date(r.publishedAt || Date.now()),
//         }));

//         if (docs.length) {
//           await SocialPost.insertMany(docs, { ordered: false });
//           allPosts.push(...docs);
//         }
//       }
//     }

//     // Update group state
//     group.lastRun = now;
//     group.nextRun = computeNextRun(group.frequency);

//     await brand.save();

//     res.json({
//       success: true,
//       message: `Group executed`,
//       groupName: group.groupName,
//       fetched: allPosts.length,
//     });
//   } catch (err) {
//     console.error("Group run error:", err);
//     res.status(500).json({ success: false, message: err.message });
//   }
// };




export const runSearch = async (req, res) => {
  try {
    const { brandName } = req.body;

    if (!brandName) {
      return res.status(400).json({ success: false, message: "brandName is required" });
    }

    const brand = await Brand.findOne({ brandName });
    if (!brand) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    const groupsToExecute = deriveGroupExecutions(brand);
    if (groupsToExecute.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No keyword groups or brand-level keywords configured for this brand",
      });
    }

    const now = new Date();
    const startDate = new Date(now.getTime() - 60 * 60 * 1000);
    const endDate = new Date(now.getTime() - 10 * 1000);

    const summary = SUPPORTED_REALTIME_PLATFORMS.reduce((acc, platform) => ({ ...acc, [platform]: 0 }), {});
    const postsToInsert = [];

    for (const group of groupsToExecute) {
      for (const platform of group.platforms) {
        const fetcher = REALTIME_PLATFORM_FETCHERS[platform];
        if (!fetcher) continue;

        for (const keyword of group.keywords) {
          let fetchedData = [];
          try {
            fetchedData = await fetcher(keyword, {
              include: group.includeKeywords,
              exclude: group.excludeKeywords,
              language: group.language,
              country: group.country,
              startDate,
              endDate,
            });
          } catch (fetchErr) {
            console.error(`Search Run Error: ${platform} fetch failed`, {
              brand: brand.brandName,
              group: group.name,
              keyword,
              error: fetchErr.message,
            });
            continue;
          }

          summary[platform] += fetchedData.length;

          if (fetchedData.length > 0) {
            const docs = fetchedData.map((item) => ({
              ...item,
              brand: brand._id,
              brandName: brand.brandName,
              groupName: group.name,
              keyword,
              platform,
              groupId: group._id,
              groupName: group.groupName,
              createdAt: new Date(item.createdAt || item.publishedAt || Date.now()),
              fetchedAt: new Date(),
            }));

            postsToInsert.push(...docs);
          }
        }
      }
    }

    if (postsToInsert.length > 0) {
      await SocialPost.insertMany(postsToInsert, { ordered: false });
    }

    res.json({
      success: true,
      brandName: brand.brandName,
      groupsExecuted: groupsToExecute.length,
      fetched: postsToInsert.length,
      summary,
    });
  } catch (err) {
    console.error("Search Run Error:", err);
    res.status(500).json({ success: false, message: err.message });
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

    // Fetch brand
    const brand = await Brand.findOne({ brandName });
    if (!brand) {
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    // Get specific Keyword Group
    const group = brand.keywordGroups.find(
      (g) => g.groupName.toLowerCase() === groupName.toLowerCase()
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: `Keyword group "${groupName}" not found`,
      });
    }

    // If group is paused → do not run
    if (group.status === "paused" || group.paused === true) {
      return res.status(400).json({
        success: false,
        message: `Keyword group "${groupName}" is paused`,
      });
    }

    // Time window
    const now = new Date();
    const startDate = new Date(now.getTime() - 60 * 60 * 1000); // last 1 hour
    const endDate = new Date(now.getTime() - 10 * 1000);

    const summary = SUPPORTED_REALTIME_PLATFORMS.reduce(
      (acc, platform) => ({ ...acc, [platform]: 0 }),
      {}
    );

    const postsToInsert = [];

    // Loop platforms
    for (const platform of group.platforms) {
      const fetcher = REALTIME_PLATFORM_FETCHERS[platform];
      if (!fetcher) continue;

      // Loop keywords
      for (const keyword of group.keywords) {
        let fetchedData = [];

        try {
          fetchedData = await fetcher(keyword, {
            include: group.includeKeywords,
            exclude: group.excludeKeywords,
            language: group.language,
            country: group.country,
            startDate,
            endDate,
          });
        } catch (fetchErr) {
          console.error(`Group Fetch Error [${platform}]`, {
            brand: brand.brandName,
            group: group.groupName,
            keyword,
            error: fetchErr.message,
          });
          continue;
        }

        summary[platform] += fetchedData.length;

        if (fetchedData.length > 0) {
          const docs = fetchedData.map((item) => ({
            ...item,
            brand: brand._id,
            brandName: brand.brandName,
            keyword,
            platform,
            groupId: group._id,
            groupName: group.groupName,
            createdAt: new Date(item.createdAt || item.publishedAt || Date.now()),
            fetchedAt: new Date(),
          }));

          postsToInsert.push(...docs);
        }
      }
    }

    if (postsToInsert.length > 0) {
      await SocialPost.insertMany(postsToInsert, { ordered: false });
    }

    res.json({
      success: true,
      brandName: brand.brandName,
      groupName: group.groupName,
      keywordsExecuted: group.keywords.length,
      fetched: postsToInsert.length,
      summary,
    });
  } catch (err) {
    console.error("Group Search Run Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


