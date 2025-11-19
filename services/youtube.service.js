import { getYouTubeSearchResults } from "../integrations/youtubeAPI.js";
export const fetchYouTubeSearch = async (
  keyword,
  { include = [], exclude = [], language = "en", country = "IN", startDate, endDate } = {}
) => {
  // Build query
  let query = keyword;
  if (include.length) query += " " + include.join(" ");
  if (exclude.length) query += " -" + exclude.join(" -");

  const results = await getYouTubeSearchResults({
    keyword: query,
    language,
    regionCode: country,
    startDate,
    endDate,
  });

  if (!results?.length) return [];

  const docs = results.map((video) => ({
    keyword,
    platform: "youtube",
    createdAt: new Date(video.publishedAt),
    author: { name: video.channelTitle },
    content: {
      text: video.title,
      description: video.description,
      mediaUrl: video.thumbnails?.high?.url || null,
    },
    metrics: {
      likes: Number(video.likeCount || 0),
      comments: Number(video.commentCount || 0),
      views: Number(video.viewCount || 0),
    },
    sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
  }));

  return docs;
};
