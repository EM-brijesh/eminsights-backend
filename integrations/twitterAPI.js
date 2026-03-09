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

    // Build users lookup map
    const usersMap = {};
    if (data.includes?.users) {
      data.includes.users.forEach((u) => {
        usersMap[u.id] = u;
      });
    }

    // Build places lookup map
    const placesMap = {};
    if (data.includes?.places) {
      data.includes.places.forEach((p) => {
        placesMap[p.id] = p;
      });
    }

    return data.data.map((tweet) => {
      const user = usersMap[tweet.author_id] || {};
      const place = tweet.geo?.place_id ? placesMap[tweet.geo.place_id] : null;

      return {
        // ✅ tweetId always set — used as reliable dedup key in the DB index
        tweetId: tweet.id,

        // ✅ sourceUrl built from tweet.id — will be undefined if tweet.id missing (extremely rare)
        sourceUrl: tweet.id ? `https://twitter.com/i/web/status/${tweet.id}` : undefined,

        createdAt: tweet.created_at,

        // ✅ Guard against "undefined" string — only save real lang codes
        language: (tweet.lang && tweet.lang !== "und") ? tweet.lang : null,

        author: {
          id: tweet.author_id || null,
          name: user.name || null,
          username: user.username || null,
          profileImage: user.profile_image_url || null,
        },

        content: {
          text: tweet.text || null,
        },

        metrics: {
          likes: tweet.public_metrics?.like_count || 0,
          comments: tweet.public_metrics?.reply_count || 0,
          shares: tweet.public_metrics?.retweet_count || 0,
          views: tweet.public_metrics?.impression_count || 0,
        },

        // ✅ Prefer geo place (tweet-level), fall back to user.location string
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