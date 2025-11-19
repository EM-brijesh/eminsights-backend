import { fetchYouTubeSearch } from "../services/youtube.service.js";
import { fetchTwitterSearch } from "../services/twitter.service.js";
import { fetchRedditSearch } from "../services/reddit.service.js";

export const searchHistorical = async (req, res) => {
  try {
    const {
      keyword,
      platforms = ["twitter", "youtube", "reddit"],
      include = [],
      exclude = [],
      language = "en",
      country = "IN",
      startDate,
      endDate
    } = req.body;

    if (!keyword) {
      return res.status(400).json({ success: false, message: "Keyword is required" });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: "Start and End dates are required for historical search" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({ success: false, message: "Start date must be before end date" });
    }

    // Twitter constraint: only last 7 days
    const sevenDaysAgo = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const safeStart = start < sevenDaysAgo ? sevenDaysAgo : start;

    const results = {};
    const promises = [];

    if (platforms.includes("twitter")) {
      promises.push(
        fetchTwitterSearch(keyword, {
          includeKeywords: include,
          excludeKeywords: exclude,
          language,
          country,
          startDate: safeStart,
          endDate: end
        }).then((data) => (results.twitter = data))
      );
    }

    if (platforms.includes("youtube")) {
      promises.push(
        fetchYouTubeSearch(keyword, {
          includeKeywords: include,
          excludeKeywords: exclude,
          language,
          country,
          startDate: start,
          endDate: end
        }).then((data) => (results.youtube = data))
      );
    }

    if (platforms.includes("reddit")) {
      promises.push(
        fetchRedditSearch(keyword, {
          includeKeywords: include,
          excludeKeywords: exclude,
          startDate: start,
          endDate: end
        }).then((data) => (results.reddit = data))
      );
    }

    await Promise.all(promises);

    res.json({
      success: true,
      mode: "historical",
      keyword,
      dateRange: { start, end },
      platforms,
      results
    });
  } catch (error) {
    console.error("Historical Search Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
