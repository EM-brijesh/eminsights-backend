import Parser from "rss-parser";

const parser = new Parser();

// 🔹 Google News RSS generator
const buildGoogleNewsRSSUrl = (query) => {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
};

export const fetchRSSNews = async (
  keyword,
  {
    include = [],
    exclude = [],
    language = "en",
    country = "IN",
  } = {}
) => {
  try {
    let query = keyword;

    if (include.length) query += " " + include.join(" ");
    if (exclude.length) query += " " + exclude.map(k => `-${k}`).join(" ");

    const url = buildGoogleNewsRSSUrl(query);

    console.log("📰 RSS URL:", url);

    const feed = await parser.parseURL(url);

    if (!feed.items) return [];

    return feed.items.map((item) => ({
      sourceUrl: item.link,

      author: {
        name: item.creator || item.author || "Unknown",
      },

      content: {
        text: item.title,
        description: item.contentSnippet || item.content || "",
      },

      createdAt: item.pubDate ? new Date(item.pubDate) : new Date(),

      metrics: {
        likes: 0,
        comments: 0,
        shares: 0,
        views: 0,
      },

      location: {
        fullName: country,
        country,
        countryCode: country,
        placeType: "country",
      },
    }));

  } catch (error) {
    console.error("❌ RSS Fetch Error:", error.message);
    return [];
  }
};