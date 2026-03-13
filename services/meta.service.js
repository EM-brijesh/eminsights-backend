import axios from "axios";

const GRAPH_API = "https://graph.facebook.com/v21.0";

/**
 * Exchange OAuth code for user access token
 */
export const exchangeCodeForToken = async ({ code, redirectUri }) => {
  const { data } = await axios.get(`${GRAPH_API}/oauth/access_token`, {
    params: {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri: redirectUri,
      code
    }
  });

  return data;
};

/**
 * Fetch Facebook Pages
 */
export const fetchUserPages = async (userToken) => {
  const { data } = await axios.get(`${GRAPH_API}/me/accounts`, {
    params: {
      access_token: userToken
    }
  });

  return data.data || [];
};

//facebook_page_owned_search
export const fetchPagePosts = async ({
  pageId,
  accessToken,
  limit = 10
}) => {
  console.log("\n🔹 fetchPagePosts called");
  console.log("  Page ID:", pageId);
  console.log("  Limit:", limit);

  try {
    const { data } = await axios.get(`${GRAPH_API}/${pageId}/posts`, {
      params: {
        fields: [
          "id",
          "message",
          "created_time",
          "permalink_url",
          "reactions.summary(true)",
          "comments.summary(true)",
          "shares"
        ].join(","),
        limit,
        access_token: accessToken
      }
    });

    console.log(`  ✅ Fetched ${data.data?.length || 0} page posts`);
    return data.data || [];

  } catch (error) {
    console.error(
      "  ❌ Page post fetch error:",
      error.response?.data || error.message
    );
    throw error;
  }
};

/**
 * Get Instagram Business Account ID
 */
export const fetchInstagramBusinessAccount = async ({
  pageId,
  pageAccessToken
}) => {
  const { data } = await axios.get(`${GRAPH_API}/${pageId}`, {
    params: {
      fields: "connected_instagram_account{id,username,name,profile_picture_url,followers_count,media_count}",
      access_token: pageAccessToken
    }
  });

  // Return full Instagram object, not just ID
  return data?.connected_instagram_account || null;
};

/**
 * Get hashtag ID
 */
export const getInstagramHashtagId = async ({
  igUserId,
  accessToken,
  hashtag
}) => {
  console.log("      🔸 getInstagramHashtagId called");
  console.log("        Hashtag:", hashtag);
  
  try {
    const { data } = await axios.get(`${GRAPH_API}/ig_hashtag_search`, {
      params: {
        user_id: igUserId,
        q: hashtag,
        access_token: accessToken
      }
    });

    const hashtagId = data?.data?.[0]?.id || null;
    console.log("        Result:", hashtagId || "NOT FOUND");
    
    return hashtagId;
  } catch (error) {
    console.error("        ❌ Hashtag search error:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Fetch Instagram hashtag posts
 */
export const fetchInstagramHashtagPosts = async ({
  igUserId,
  accessToken,
  hashtag,
  limit = 25
}) => {
  console.log("\n    🔹 fetchInstagramHashtagPosts called");
  console.log("      Hashtag:", hashtag);
  console.log("      User ID:", igUserId);
  console.log("      Requested limit:", limit);

  try {
    console.log("    ⏳ Getting hashtag ID...");
    const hashtagId = await getInstagramHashtagId({ igUserId, accessToken, hashtag });

    if (!hashtagId) {
      console.log("    ❌ No hashtag ID found");
      return [];
    }

    console.log("    ✅ Hashtag ID:", hashtagId);

    const fields = "id,caption,permalink,timestamp,username";
    const allPosts = [];
    const seenIds = new Set();

    // Fetch from BOTH edges
    const edges = ["recent_media", "top_media"];
    for (const edge of edges) {
      try {
        console.log(`    ⏳ Fetching ${edge}...`);

        const { data } = await axios.get(`${GRAPH_API}/${hashtagId}/${edge}`, {
          params: {
            user_id: igUserId,
            fields,
            limit: Math.min(limit, 50), // Instagram max is 50
            access_token: accessToken
          }
        });

        const posts = data.data || [];
        console.log(`    ✅ Got ${posts.length} posts from ${edge}`);

        // Deduplicate across edges
        for (const post of posts) {
          if (!seenIds.has(post.id)) {
            seenIds.add(post.id);
            allPosts.push(post);
          }
        }

      } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        const errorCode = error.response?.data?.error?.code;
        console.log(`    ⚠️ ${edge} failed (code ${errorCode}): ${errorMsg}`);
        // Don't throw — continue to next edge
      }
    }

    console.log(`    ✅ Total unique posts: ${allPosts.length}`);
    return allPosts;

  } catch (error) {
    console.error("    ❌ Instagram API Error:", error.response?.data || error.message);
    throw error;
  }
};