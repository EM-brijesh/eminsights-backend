import { getGoogleSearchResults } from "../integrations/webAPI.js";




export const fetchGoogleSearch = async (
  keyword,
  { include = [], exclude = [] } = {}
) => {
  const results = await getGoogleSearchResults({
    keyword,
    includeKeywords: include,
    excludeKeywords: exclude,
  });

  if (!results?.length) return [];

  return results.map((item) => ({
    keyword,
    platform: "google",
    createdAt: item.date ? new Date(item.date) : null,

    author: {
      name: item.displayLink || "",
      id: item.displayLink || "",
      username: item.displayLink || "",
      profileImage: item.thumbnail || "",
    },

    content: {
      title: item.title,
      text: item.snippet,
    },

    metrics: {
      likes: 0,
      comments: 0,
      shares: 0,
    },

    sourceUrl: item.link,
  }));
};
