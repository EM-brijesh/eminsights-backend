import { fetchInstagramHashtagPosts } from "./meta.service.js";
import MetaAccount from "../models/meta.js";

export const fetchInstagramSearch = async (
  keyword,
  { brand, group, limit = 25 }
) => {
  console.log("\n🔷 INSTAGRAM FETCHER CALLED");
  console.log("  Keyword:", keyword);
  console.log("  Brand:", brand.brandName);
  console.log("  Limit:", limit);

  // ✅ Get ANY active MetaAccount (first one available)
  console.log("  ⏳ Looking up available MetaAccount...");
  
  const metaAccount = await MetaAccount.findOne({ 
    isActive: true 
  }).lean();
  
  if (!metaAccount) {
    console.log("  ❌ No MetaAccount found");
    console.log("  💡 Need to connect an Instagram account first");
    return [];
  }
  
  console.log("  ✅ Using MetaAccount:", metaAccount.pageName || metaAccount.accountLabel);
  console.log("  Page ID:", metaAccount.pageId);

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

    const normalized = posts.map((p) => ({
      keyword,
      platform: "instagram",
      createdAt: new Date(p.timestamp),
      author: {
        name:  "Instagram User"
      },
      content: {
        text: p.caption || "",
        mediaUrl: null
      },
      metrics: {
        likes: 0,
        comments: 0
      },
      sourceUrl: p.permalink,
      instagramId: p.id
    }));
    
    console.log("  ✅ Normalized posts");
    return normalized;
    
  } catch (error) {
    console.error("  ❌ Instagram fetch error:", error.message);
    return [];
  }
};
