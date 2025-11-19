import axios from "axios";

export const getYouTubeSearchResults = async ({
  keyword,
  includeKeywords = [],
  excludeKeywords = [],
  startDate,
  endDate,
  maxResults = 10,
  language = "en",
  country = "IN"
}) => {
  try {
    const API_KEY = process.env.YT_API_KEY;
    let query = keyword;

    // Build search query
    if (includeKeywords.length) query += " " + includeKeywords.join(" ");
    if (excludeKeywords.length) query += " -" + excludeKeywords.join(" -");

    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      q: query,
      order: "date", // ✅ ensures newest first
      maxResults: maxResults.toString(),
      key: API_KEY
    });

    // Apply date filters (YouTube requires ISO format)
    if (startDate) params.append("publishedAfter", new Date(startDate).toISOString());
    if (endDate) params.append("publishedBefore", new Date(endDate).toISOString());

    // Optional: region or language hints
    if (country) params.append("regionCode", country);
    if (language) params.append("relevanceLanguage", language);

    const { data } = await axios.get(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);

    if (!data.items?.length) {
      console.warn("⚠️ YouTube returned no recent videos for query:", query);
      return [];
    }

    // Enrich with stats (likes/views/comments)
    const videoIds = data.items.map((v) => v.id.videoId).join(",");
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${API_KEY}`;
    const statsRes = await axios.get(statsUrl);

    return statsRes.data.items.map((item) => ({
      videoId: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      channelTitle: item.snippet.channelTitle,
      url: `https://www.youtube.com/watch?v=${item.id}`,
      thumbnails: item.snippet.thumbnails,
      stats: item.statistics
    }));
  } catch (error) {
    console.error("YouTube API error:", error.response?.data || error.message);
    return [];
  }
};
