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

  // Build query
  let query = keyword;
  if (includeKeywords.length) query += " " + includeKeywords.join(" ");
  if (excludeKeywords.length) query += " " + excludeKeywords.map((k) => `-${k}`).join(" ");

  const params = {
    query,
    max_results: Math.min(Math.max(maxResults, 10), 100),
    "tweet.fields": "created_at,public_metrics,author_id,text,geo",
    expansions: "author_id,geo.place_id",
    "user.fields": "name,username,profile_image_url,location", // ⭐ FIX
    "place.fields": "full_name,country,country_code,place_type,geo",
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

    // Create mapping of users by ID
    const usersMap = {};
    if (data.includes?.users) {
      data.includes.users.forEach((u) => {
        usersMap[u.id] = u;
      });
    }

    // Create mapping of places by ID
    const placesMap = {};
    if (data.includes?.places) {
      data.includes.places.forEach((p) => {
        placesMap[p.id] = p;
      });
    }

    // Merge tweets + user info + place info
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
        retweetCount: tweet.public_metrics?.retweet_count,
        replyCount: tweet.public_metrics?.reply_count,
        likeCount: tweet.public_metrics?.like_count,
        quoteCount: tweet.public_metrics?.quote_count,
        tweetUrl: `https://twitter.com/i/web/status/${tweet.id}`,

        location: place
          ? {
              placeId: place.id,
              fullName: place.full_name,
              country: place.country,
              countryCode: place.country_code,
              placeType: place.place_type,
              coordinates: place.geo?.geometry?.coordinates || null,
            }
          : user.location
          ? {
              name: user.location, // ⭐ fallback from user profile
            }
          : null,
      };
    });
  } catch (error) {
    console.error("Twitter API error:", error.response?.data || error.message);
    return [];
  }
};