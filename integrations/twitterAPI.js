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

    const usersMap = {};
    if (data.includes?.users) {
      data.includes.users.forEach((u) => {
        usersMap[u.id] = u;
      });
    }

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
        tweetId: tweet.id,
        text: tweet.text,
        authorId: tweet.author_id,
        authorName: user.name || "",
        authorUsername: user.username || "",
        authorProfileImage: user.profile_image_url || "",
        createdAt: tweet.created_at,
        language: tweet.lang || null,

        retweetCount: tweet.public_metrics?.retweet_count || 0,
        replyCount: tweet.public_metrics?.reply_count || 0,
        likeCount: tweet.public_metrics?.like_count || 0,
        quoteCount: tweet.public_metrics?.quote_count || 0,

        tweetUrl: `https://twitter.com/i/web/status/${tweet.id}`,

        // ⭐ Simplified location (matches your schema)
        location: place
          ? {
              placeId: place.id,
              fullName: place.full_name,
              country: place.country,
              countryCode: place.country_code,
              placeType: place.place_type,
            }
          : user.location
          ? {
              fullName: user.location,
            }
          : null,
      };
    });
  } catch (error) {
    console.error("Twitter API error:", error.response?.data || error.message);
    return [];
  }
};