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
  if (excludeKeywords.length)
    query += " " + excludeKeywords.map((k) => `-${k}`).join(" ");

  const params = {
    query,
    max_results: Math.min(Math.max(maxResults, 10), 100),

    "tweet.fields": "created_at,public_metrics,author_id,text,geo",

    expansions: "author_id,geo.place_id",

    "user.fields": "name,username,profile_image_url",

    "place.fields": "id,full_name,name,country,country_code,place_type,geo",
  };

  if (startDate) params.start_time = new Date(startDate).toISOString();
  if (endDate) params.end_time = new Date(endDate).toISOString();

  try {
    const { data } = await axios.get(baseUrl, {
      headers: {
        Authorization: `Bearer ${process.env.X_API_BEARER_TOKEN}`,
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
      const place = tweet.geo?.place_id
        ? placesMap[tweet.geo.place_id]
        : null;

      let coordinates = null;

      // ⭐ Convert polygon bbox → center point
      if (place?.geo?.bbox) {
        const [west, south, east, north] = place.geo.bbox;

        coordinates = {
          type: "Point",
          coordinates: [(west + east) / 2, (south + north) / 2],
        };
      }

      const location = place
        ? {
          placeId: place.id,
          name: place.name,
          fullName: place.full_name,
          country: place.country,
          countryCode: place.country_code,
          placeType: place.place_type,
          coordinates: place.geo?.geometry
            ? {
              type: "Point",
              coordinates: place.geo.geometry.coordinates,
            }
            : undefined,
        }
        : undefined;

      return {
        tweetId: tweet.id,

        postCreatedAt: tweet.created_at,

        author: {
          id: tweet.author_id,
          name: user.name || "",
        },

        content: {
          text: tweet.text,
        },

        metrics: {
          likes: tweet.public_metrics?.like_count || 0,
          comments: tweet.public_metrics?.reply_count || 0,
          shares: tweet.public_metrics?.retweet_count || 0,
        },

        sourceUrl: `https://twitter.com/i/web/status/${tweet.id}`,

        location,
      };
    });
  } catch (error) {
    console.error("Twitter API error:", error.response?.data || error.message);
    return [];
  }
};