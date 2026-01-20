import { fetchPagePosts } from "./meta.service.js";
import MetaAccount from "../models/meta.js";

export const fetchFacebookPagePosts = async (
  keyword,
  { brand, limit = 10 }
) => {
  console.log("\n🔷 FACEBOOK PAGE FETCHER CALLED");
  console.log("  Keyword:", keyword);
  console.log("  Brand:", brand?.brandName);

  // Use ANY active connected Page
  const metaAccount = await MetaAccount.findOne({
    isActive: true
  }).lean();

  if (!metaAccount) {
    console.log("  ❌ No connected Page found");
    return [];
  }

  const { pageId, pageAccessToken, pageName } = metaAccount;

  console.log("  ✅ Using Page:", pageName);

  try {
    const posts = await fetchPagePosts({
      pageId,
      accessToken: pageAccessToken,
      limit
    });

    // Optional keyword filter (client-side, safe)
    const filtered = keyword
      ? posts.filter(p =>
          p.message?.toLowerCase().includes(keyword.toLowerCase())
        )
      : posts;

    const normalized = filtered.map(p => ({
      keyword,
      platform: "facebook",
      createdAt: new Date(p.created_time),
      author: {
        name: pageName
      },
      content: {
        text: p.message || "",
        mediaUrl: null
      },
      metrics: {
        likes: p.reactions?.summary?.total_count || 0,
        comments: p.comments?.summary?.total_count || 0,
        shares: p.shares?.count || 0
      },
      sourceUrl: p.permalink_url,
      facebookPostId: p.id
    }));

    console.log(`  ✅ Normalized ${normalized.length} Facebook posts`);
    return normalized;

  } catch (err) {
    console.error("  ❌ Facebook fetch error:", err.message);
    return [];
  }
};
