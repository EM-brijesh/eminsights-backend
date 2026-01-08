import { fetchInstagramHashtagPosts } from "./meta.service.js";
import MetaAccount from "../models/meta.js";

export const fetchInstagramSearch = async (
  keyword,
  { brand, group, limit = 10 }
) => {
  console.log("\n🔷 INSTAGRAM FETCHER CALLED");
  console.log("  Keyword:", keyword);
  console.log("  Brand ID:", brand._id);
  console.log("  Limit:", limit);

  console.log("  ⏳ Looking up MetaAccount...");
  const metaAccount = await MetaAccount.findOne({ brand: brand._id }).lean();
  
  if (!metaAccount) {
    console.log("  ❌ No MetaAccount found for brand");
    return [];
  }
  
  console.log("  ✅ MetaAccount found");

  const igUserId = metaAccount.instagramBusinessId;
  const accessToken = metaAccount.pageAccessToken;

  console.log("  Instagram Business ID:", igUserId || "MISSING");
  console.log("  Access Token:", accessToken ? "EXISTS" : "MISSING");

  if (!igUserId || !accessToken) {
    console.log("  ❌ Missing Instagram credentials");
    return [];
  }

  console.log("  ⏳ Fetching Instagram posts...");
  
  try {
    const posts = await fetchInstagramHashtagPosts({
      igUserId,
      accessToken,
      hashtag: keyword,
      limit: Math.min(limit, 50)
    });
    
    console.log(`  ✅ Fetched ${posts.length} Instagram posts`);

    // Normalize posts - use available fields only
    const normalized = posts.map((p) => ({
      keyword,
      platform: "instagram",
      createdAt: new Date(p.timestamp),
      author: {
        name: "Instagram User" // Not available from hashtag endpoint
      },
      content: {
        text: p.caption || "",
        mediaUrl: p.media_url || null,
        mediaType: p.media_type || null
      },
      metrics: {
        likes: 0, // Not available from hashtag endpoint
        comments: 0 // Not available from hashtag endpoint
      },
      sourceUrl: p.permalink,
      instagramId: p.id
    }));
    
    console.log("  ✅ Normalized posts");
    return normalized;
    
  } catch (error) {
    console.error("  ❌ Instagram fetch error:", error.message);
    
    // Provide helpful error info
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      console.error("  📋 API Error Details:");
      console.error("     Type:", apiError.type);
      console.error("     Code:", apiError.code);
      console.error("     Message:", apiError.message);
      
      // Provide solutions based on error type
      if (apiError.code === 100) {
        console.error("  💡 Solution: Check if you're using supported fields");
      } else if (apiError.code === 190) {
        console.error("  💡 Solution: Access token may be expired");
      } else if (apiError.code === 4) {
        console.error("  💡 Solution: Rate limit reached, wait before retrying");
      }
    }
    
    throw error;
  }
};
