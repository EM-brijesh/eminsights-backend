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

/**
 * Get Instagram Business Account ID
 */
export const fetchInstagramBusinessAccount = async ({
  pageId,
  pageAccessToken
}) => {
  const { data } = await axios.get(`${GRAPH_API}/${pageId}`, {
    params: {
      fields: "connected_instagram_account",
      access_token: pageAccessToken
    }
  });

  return data?.connected_instagram_account?.id || null;
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
  limit = 10
}) => {
  console.log("\n    🔹 fetchInstagramHashtagPosts called");
  console.log("      Hashtag:", hashtag);
  console.log("      User ID:", igUserId);
  console.log("      Requested limit:", limit);

  try {
    console.log("    ⏳ Getting hashtag ID...");
    const hashtagId = await getInstagramHashtagId({
      igUserId,
      accessToken,
      hashtag
    });

    if (!hashtagId) {
      console.log("    ❌ No hashtag ID found");
      return [];
    }
    
    console.log("    ✅ Hashtag ID:", hashtagId);

    // Try different limits from smallest to largest
    // For popular hashtags like "viratkohli", Instagram throttles heavily
    const limitsToTry = [5, 10, 25];
    
    for (const tryLimit of limitsToTry) {
      if (tryLimit > limit) break; // Don't exceed requested limit
      
      try {
        console.log(`    ⏳ Trying limit: ${tryLimit}...`);
        
        const { data } = await axios.get(
          `${GRAPH_API}/${hashtagId}/recent_media`,
          {
            params: {
              user_id: igUserId,
              fields: "id,caption,permalink,timestamp", // Even fewer fields
              limit: tryLimit,
              access_token: accessToken
            }
          }
        );

        console.log(`    ✅ Success! Got ${data.data?.length || 0} posts with limit ${tryLimit}`);
        return data.data || [];
        
      } catch (error) {
        const errorCode = error.response?.data?.error?.code;
        const errorMsg = error.response?.data?.error?.message || error.message;
        
        console.log(`    ❌ Failed with limit ${tryLimit}: ${errorMsg}`);
        
        // If this is the last attempt, throw the error
        if (tryLimit === limitsToTry[limitsToTry.length - 1] || tryLimit >= limit) {
          throw error;
        }
        
        // Otherwise, continue to next limit
        continue;
      }
    }

    // If we get here, all attempts failed
    console.log("    ❌ All limit attempts failed");
    return [];
    
  } catch (error) {
    console.error("    ❌ Instagram API Error:", error.response?.data || error.message);
    
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      console.error("    Error details:");
      console.error("      Code:", apiError.code);
      console.error("      Type:", apiError.type);
      console.error("      Message:", apiError.message);
    }
    
    throw error;
  }
};