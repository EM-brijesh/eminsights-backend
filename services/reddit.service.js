import { getRedditSearchResults } from "../integrations/redditAPI.js";
export const fetchRedditSearch = async (
  keyword,
  { include = [], exclude = [], startDate, endDate } = {}
) => {
  // Build query
  let query = keyword;
  if (include.length) query += " " + include.join(" ");
  if (exclude.length) query += " -" + exclude.join(" -");

  const results = await getRedditSearchResults({
    keyword: query,
    startDate,
    endDate,
  });

  if (!results?.length) return [];

  return results.map((post) => ({
    keyword,
    platform: "reddit",
    createdAt: new Date(post.createdAt),
    author: { name: post.author },
    content: { text: post.title },
    metrics: {
      likes: post.score || 0,
      comments: post.numComments || 0,
    },
    sourceUrl: post.permalink,
  }));
};
