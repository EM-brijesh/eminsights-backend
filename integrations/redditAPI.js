import axios from "axios";
import { getRedditAccessToken } from "./redditAuth.js";

/**
 * Search Reddit posts
 */
export const getRedditSearchResults = async ({
  keyword,
  includeKeywords = [],
  excludeKeywords = [],
  dateRange = "day", // hour/day/week/month/year/all
  limit = 10,
}) => {
  try {
    const token = await getRedditAccessToken();

    let query = keyword;
    if (includeKeywords.length) query += " " + includeKeywords.join(" ");
    if (excludeKeywords.length) query += " " + excludeKeywords.map((k) => `-${k}`).join(" ");

    const url = `https://oauth.reddit.com/search?q=${encodeURIComponent(
      query
    )}&limit=${Math.min(limit, 100)}&sort=new&t=${dateRange}`;

    const { data } = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "SocialListingTool/1.0",
      },
    });

    return data.data.children.map((item) => ({
      postId: item.data.id,
      title: item.data.title,
      author: item.data.author,
      subreddit: item.data.subreddit,
      createdAt: new Date(item.data.created_utc * 1000).toISOString(),
      score: item.data.score,
      numComments: item.data.num_comments,
      permalink: `https://reddit.com${item.data.permalink}`,
    }));
  } catch (error) {
    console.error("Reddit API error:", error.response?.data || error.message);
    return [];
  }
};
