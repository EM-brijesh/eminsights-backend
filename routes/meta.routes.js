import express from "express";
import {
  exchangeCodeForToken,
  fetchUserPages,
  fetchInstagramBusinessAccount
} from "../services/meta.service.js";
import { fetchFacebookPagePosts } from "../services/facebook_fetcher.js";
import MetaAccount from "../models/meta.js";

const router = express.Router();

/**
 * 1️⃣ META LOGIN
 * Redirect user to Facebook OAuth
 */
router.get("/auth/login", (req, res) => {
  const redirectUri = process.env.META_REDIRECT_URI;

  const scopes = [
    "pages_show_list",
    "pages_read_engagement",
    "instagram_basic"
  ].join(",");

  const authUrl =
    `https://www.facebook.com/v21.0/dialog/oauth` +
    `?client_id=${process.env.META_APP_ID}` +
    `&redirect_uri=${redirectUri}` +
    `&scope=${scopes}`;

  res.redirect(authUrl);
});

/**
 * 2️⃣ META CALLBACK
 * Exchange code → user access token → redirect to frontend
 */
router.get("/auth/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing OAuth code");

    const tokenData = await exchangeCodeForToken({
      code,
      redirectUri: process.env.META_REDIRECT_URI
    });

    // Redirect frontend with token (frontend stores temporarily)
    res.redirect(
      `${process.env.FRONTEND_URL}/settings/channel-config?metaToken=${tokenData.access_token}`
    );
  } catch (err) {
    console.error("Meta OAuth Callback Error:", err.message);
    res.status(500).send("Meta authentication failed");
  }
});

/**
 * 3️⃣ FETCH USER PAGES
 * Uses short-lived user access token
 */
router.post("/pages", async (req, res) => {
  try {
    const { userToken } = req.body;
    if (!userToken) {
      return res.status(400).json({ error: "userToken is required" });
    }

    const pages = await fetchUserPages(userToken);

    res.json({ success: true, pages });
  } catch (err) {
    console.error("Fetch Pages Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4️⃣ CONNECT PAGE + INSTAGRAM
 * Saves credentials required for hashtag search
 */
/**
 * 4️⃣ CONNECT PAGE + INSTAGRAM
 * Saves credentials required for hashtag search
 */
router.post("/connect", async (req, res) => {
  try {
    const {
      pageId,
      pageName,
      pageAccessToken,
      accountLabel,
      connectedBy
    } = req.body;

    if (!pageId || !pageAccessToken) {
      return res.status(400).json({
        error: "pageId and pageAccessToken are required"
      });
    }

    // Fetch Instagram Business Account with full details
    const instagramAccount = await fetchInstagramBusinessAccount({
      pageId,
      pageAccessToken
    });

    if (!instagramAccount) {
      return res.status(400).json({
        error: "No Instagram Business account linked to this page"
      });
    }

    // ✅ Save with full Instagram details
    const metaAccount = await MetaAccount.findOneAndUpdate(
      { pageId },
      {
        pageId,
        pageName,
        pageAccessToken,
        instagramBusinessId: instagramAccount.id, // ID for API calls
        instagramUsername: instagramAccount.username, // For display
        instagramName: instagramAccount.name, // For display
        instagramProfilePicture: instagramAccount.profile_picture_url, // For display
        instagramFollowers: instagramAccount.followers_count, // For display
        instagramMediaCount: instagramAccount.media_count, // For display
        accountLabel: accountLabel || instagramAccount.username || pageName || "Instagram Account",
        connectedBy: connectedBy || null,
        isActive: true,
        connectedAt: new Date()
      },
      { upsert: true, new: true }
    );

    console.log("✅ MetaAccount connected (global)");
    console.log("Page:", metaAccount.pageName);
    console.log("Instagram:", `@${instagramAccount.username}`);
    console.log("Instagram Business ID:", instagramAccount.id);

    res.json({ 
      success: true,
      message: "Instagram account connected successfully",
      data: {
        id: metaAccount._id,
        pageId: metaAccount.pageId,
        pageName: metaAccount.pageName,
        accountLabel: metaAccount.accountLabel,
        instagram: {
          id: instagramAccount.id,
          username: instagramAccount.username,
          name: instagramAccount.name,
          profile_picture: instagramAccount.profile_picture_url,
          followers_count: instagramAccount.followers_count,
          media_count: instagramAccount.media_count
        }
      }
    });
  } catch (err) {
    console.error("Meta Connect Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

//show connected account 

router.get("/connected-accounts", async (req, res) => {
  try {
    const accounts = await MetaAccount.find({ isActive: true });
    
    // Format response to include Instagram details
    const formattedAccounts = accounts.map(acc => ({
      id: acc._id,
      pageId: acc.pageId,
      pageName: acc.pageName,
      accountLabel: acc.accountLabel,
      connectedAt: acc.connectedAt,
      instagram: acc.instagramBusinessId ? {
        id: acc.instagramBusinessId,
        username: acc.instagramUsername,
        name: acc.instagramName,
        profile_picture: acc.instagramProfilePicture,
        followers_count: acc.instagramFollowers,
        media_count: acc.instagramMediaCount
      } : null
    }));
    
    res.json({ success: true, accounts: formattedAccounts });
  } catch (err) {
    console.error("Fetch Connected Accounts Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/page-posts", async (req, res) => {
  try {
    const { keyword, limit = 10, brand } = req.body;

    console.log("\n📘 Page posts route called");
    console.log("  Keyword:", keyword);
    console.log("  Limit:", limit);

    const posts = await fetchFacebookPagePosts(keyword, {
      brand,
      limit
    });

    res.json({
      success: true,
      count: posts.length,
      posts
    });

  } catch (err) {
    console.error("Fetch Page Posts Route Error:", err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


export default router;
