import axios from "axios";

export const getTwitterSearchResults = async ({
  keyword,
  includeKeywords = [],
  excludeKeywords = [],
  startDate,
  endDate,
  maxResults = 10,
}) => {
  const baseUrl = "https://api.twitter.com/2/tweets/search/recent";

  let query = keyword;
  if (includeKeywords.length) query += " " + includeKeywords.join(" ");
  if (excludeKeywords.length) query += " " + excludeKeywords.map((k) => `-${k}`).join(" ");

  const params = {
    query,
    max_results: Math.min(Math.max(maxResults, 10), 100),
    "tweet.fields": "created_at,public_metrics,author_id,text,geo,lang",
    expansions: "author_id,geo.place_id",
    "user.fields": "name,username,profile_image_url,location",
    "place.fields": "full_name,country,country_code,place_type",
  };

  if (startDate) params.start_time = new Date(startDate).toISOString();
  if (endDate) params.end_time = new Date(endDate).toISOString();

  try {
    const { data } = await axios.get(baseUrl, {
      headers: {
        Authorization: `Bearer ${process.env.X_API_BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
      params,
    });

    if (!data?.data) return [];

    // ✅ Build users lookup map
    const usersMap = {};
    if (data.includes?.users) {
      data.includes.users.forEach((u) => {
        usersMap[u.id] = u;
      });
    }

    // ✅ Build places lookup map
    const placesMap = {};
    if (data.includes?.places) {
      data.includes.places.forEach((p) => {
        placesMap[p.id] = p;
      });
    }

    // ✅ FIX #1: Return nested objects that match schema shape.
    // Previously returned flat fields (authorName, likeCount, etc.)
    // causing the controller to silently save nulls/empty objects.
    return data.data.map((tweet) => {
      const user = usersMap[tweet.author_id] || {};
      const place = tweet.geo?.place_id ? placesMap[tweet.geo.place_id] : null;

      return {
        createdAt: tweet.created_at,
        language: tweet.lang || null,
        // ✅ FIX: guard against tweet.id being undefined — template literal would
        // produce "https://twitter.com/i/web/status/undefined" which is worse than null
        sourceUrl: tweet.id ? `https://twitter.com/i/web/status/${tweet.id}` : undefined,

        // ✅ Nested author object — matches schema & controller expectations
        author: {
          id: tweet.author_id || null,
          name: user.name || null,
          username: user.username || null,
          profileImage: user.profile_image_url || null,
        },

        // ✅ Nested content object
        content: {
          text: tweet.text || null,
        },

        // ✅ Nested metrics using Twitter's actual field names
        metrics: {
          likes: tweet.public_metrics?.like_count || 0,
          comments: tweet.public_metrics?.reply_count || 0,
          shares: tweet.public_metrics?.retweet_count || 0,
          views: tweet.public_metrics?.impression_count || 0,
        },

        // ✅ FIX #1 (core location bug):
        // Prefers geo place data (tweet-level), falls back to user.location
        // string (e.g. "Detroit, MI"). Previously the fallback was lost
        // because the controller did item.location || null with no fallback.
        location: place
          ? {
              placeId: place.id,
              fullName: place.full_name,
              country: place.country,
              countryCode: place.country_code,
              placeType: place.place_type,
            }
          : user.location
          ? { fullName: user.location }
          : null,
      };
    });
  } catch (error) {
    console.error("Twitter API error:", error.response?.data || error.message);
    return [];
  }
};