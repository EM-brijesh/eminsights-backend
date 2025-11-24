import axios from "axios";

export const getGoogleSearchResults = async ({
    keyword,
    includeKeywords = [],
    excludeKeywords = [],
    maxResults = 10,
  }) => {
    const baseUrl = "https://www.googleapis.com/customsearch/v1";
  
    let query = keyword;
    if (includeKeywords.length) query += " " + includeKeywords.join(" ");
    if (excludeKeywords.length) query += " " + excludeKeywords.map(k => `-${k}`).join(" ");
  
    const params = {
      key: process.env.GOOGLE_API_KEY,
      cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
      q: query,
      num: Math.min(Math.max(maxResults, 1), 10),
    };
  
    try {
      const { data } = await axios.get(baseUrl, { params });
  
      console.log("🌐 Google API Raw Response:", data); // SAFE LOG
  
      if (!data?.items) return [];
  
      return data.items.map((item) => ({
        title: item.title,
        snippet: item.snippet,
        link: item.link,
        displayLink: item.displayLink,
        thumbnail: item.pagemap?.cse_image?.[0]?.src || "",
        date: item.pagemap?.metatags?.[0]?.["article:published_time"] || null,
      }));
  
    } catch (error) {
      console.error("❌ Google Search API error:", {
        message: error.message,
        details: error.response?.data,
      });
      return []; // <-- SAFE RETURN
    }
  };
  