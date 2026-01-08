import express from "express";
import {
  exchangeCodeForToken,
  fetchUserPages,
  fetchInstagramBusinessAccount
} from "../services/meta.service.js";
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
      userId,
      brandId, // 🆕 ADD THIS
      pageId,
      pageName,
      pageAccessToken
    } = req.body;

    if (!userId || !pageId || !pageAccessToken) {
      return res.status(400).json({
        error: "userId, pageId and pageAccessToken are required"
      });
    }

    // 🆕 Validate brand exists if provided
    if (brandId) {
      const brand = await Brand.findById(brandId);
      if (!brand) {
        return res.status(404).json({
          error: "Brand not found"
        });
      }
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

    // Save or update Meta account
    const metaAccount = await MetaAccount.findOneAndUpdate(
      { userId, brand: brandId }, // 🆕 Query by both userId and brand
      {
        userId,
        brand: brandId, // 🆕 Save brand reference
        pageId,
        pageName,
        pageAccessToken,
        instagramBusinessId
      },
      { upsert: true, new: true }
    );

    console.log("✅ MetaAccount connected");
    console.log("User ID:", userId);
    console.log("Brand ID:", brandId);
    console.log("Instagram Business ID:", instagramBusinessId);

    res.json({ 
      success: true,
      data: {
        pageId: metaAccount.pageId,
        pageName: metaAccount.pageName,
        instagramBusinessId: metaAccount.instagramBusinessId
      }
    });
  } catch (err) {
    console.error("Meta Connect Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});


export default router;
