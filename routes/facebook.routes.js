// routes/facebookRoutes.js
import express from "express";
import { insertFBpage } from "../integrations/facebookPage.js";
import { fetchFacebookPublicPosts } from "../services/fbpublicpagefetcher.js";


const router = express.Router();

router.post("/add-pages", async (req, res) => {
  try {
    const { pageId, pageName } = req.body;

    const page = await insertFBpage(pageId, pageName);

    res.json({
      success: true,
      data: page,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

//public page
router.post("/fetch-publicposts", async (req, res) => {
  try {
    const total = await fetchFacebookPublicPosts();
    res.json({ success: true, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});



export default router;