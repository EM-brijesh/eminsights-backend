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
router.post("/connect", async (req, res) => {
  try {
    const {
      pageId,
      pageName,
      pageAccessToken,
      accountLabel, // Optional friendly name
      connectedBy // Optional: userId who connected it
    } = req.body;

    if (!pageId || !pageAccessToken) {
      return res.status(400).json({
        error: "pageId and pageAccessToken are required"
      });
    }

    // Fetch IG Business Account ID
    const instagramBusinessId = await fetchInstagramBusinessAccount({
      pageId,
      pageAccessToken
    });

    if (!instagramBusinessId) {
      return res.status(400).json({
        error: "No Instagram Business account linked to this page"
      });
    }

    // ✅ Save or update - independent of user/brand
    const metaAccount = await MetaAccount.findOneAndUpdate(
      { pageId }, // Unique by pageId
      {
        pageId,
        pageName,
        pageAccessToken,
        instagramBusinessId,
        accountLabel: accountLabel || pageName || "Instagram Account",
        connectedBy: connectedBy || null,
        isActive: true,
        connectedAt: new Date()
      },
      { upsert: true, new: true }
    );

    console.log("✅ MetaAccount connected (global)");
    console.log("Page:", metaAccount.pageName);
    console.log("Instagram Business ID:", instagramBusinessId);
    console.log("This account can now be used for ALL brands");

    res.json({ 
      success: true,
      message: "Instagram account connected successfully",
      data: {
        id: metaAccount._id,
        pageId: metaAccount.pageId,
        pageName: metaAccount.pageName,
        accountLabel: metaAccount.accountLabel,
        instagramBusinessId: metaAccount.instagramBusinessId
      }
    });
  } catch (err) {
    console.error("Meta Connect Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

//show connected account 

router.get("/connected-accounts" , async (req, res) => {
  try {
    const account = await MetaAccount.find({ isActive: true });
    res.json({ success: true, accounts: account });
  }
  catch (err) {
    console.error("Fetch Connected Accounts Error:", err.message);
    res.status(500).json({ error: err.message });
  }
})

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
