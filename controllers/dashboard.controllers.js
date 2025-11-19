// controllers/data.controller.js
import { Brand } from "../models/brand.js";
import { SocialPost } from "../models/data.js";

export const getPostsByBrand = async (req, res) => {
  try {
    const {
      brandName,
      platform,     // optional (youtube/twitter/reddit)
      keyword,      // optional
      limit = 20,
      sort = "desc" // newest first by default
    } = req.query;

    if (!brandName) {
      return res.status(400).json({
        success: false,
        message: "brandName query parameter is required"
      });
    }

    // 🔍 find the brand first
    const brand = await Brand.findOne({ brandName });
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found"
      });
    }

    // 🧩 Build query filter
    const filter = { brand: brand._id };
    if (platform) filter.platform = platform;
    if (keyword) filter.keyword = keyword;

    const sortOrder = sort === "asc" ? 1 : -1;

    const posts = await SocialPost.find(filter)
      .populate("brand", "brandName")
      .sort({ createdAt: sortOrder })
      .limit(Number(limit))
      .exec();

    res.json({
      success: true,
      brand: brandName,
      count: posts.length,
      filters: { platform: platform || "all", keyword: keyword || "all" },
      data: posts
    });
  } catch (err) {
    console.error("Error fetching brand posts:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

export const getAllKeywordsByBrand = async (req, res) => {
  try {
    const { brandName } = req.query;

    if (!brandName) {
      return res
        .status(400)
        .json({ success: false, message: "brandName query parameter is required" });
    }

    const brand = await Brand.findOne({ brandName });
    if (!brand) {
      return res
        .status(404)
        .json({ success: false, message: "Brand not found" });
    }

    const keywords = await SocialPost.distinct("keyword", { brand: brand._id });

    res.json({
      success: true,
      brand: brandName,
      count: keywords.length,
      keywords
    });
  } catch (err) {
    console.error("Error fetching brand keywords:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};



export const refreshDB = async (req, res) => {
  try {
    const {
      email,
      brandName,
      groupName,
      platform,
      startDate,
      endDate,
      keyword,
      limit = 50,
      page = 1
    } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required to fetch user-specific data"
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // Step 1: Get all brands assigned to this user (brand-level or group-level)
    const brands = await Brand.find({
      $or: [
        { assignedUsers: { $elemMatch: { $regex: new RegExp(`^${normalizedEmail}$`, "i") } } },
        { "keywordGroups.assignedUsers": { $elemMatch: { $regex: new RegExp(`^${normalizedEmail}$`, "i") } } }
      ]
    }).lean();

    if (!brands.length) {
      return res.json({
        success: true,
        message: "No brands assigned to this user",
        data: []
      });
    }

    // Step 2: Build a list of brand IDs user is allowed to see
    const allowedBrandIds = brands.map((b) => b._id.toString());

    // Step 3: Prepare mongo filter for SocialPost
    const filter = {
      brand: { $in: allowedBrandIds }
    };

    if (brandName) {
      const brand = brands.find((b) => b.brandName.toLowerCase() === brandName.toLowerCase());
      if (brand) filter.brand = brand._id;
    }

    if (groupName) {
      const matchedGroupIds = [];
      brands.forEach((b) => {
        b.keywordGroups?.forEach((g) => {
          if (g.groupName.toLowerCase() === groupName.toLowerCase()) {
            matchedGroupIds.push(g._id.toString());
          }
        });
      });

      if (matchedGroupIds.length) {
        filter.groupId = { $in: matchedGroupIds };
      }
    }

    if (platform) {
      filter.platform = platform;
    }

    if (keyword) {
      filter.keyword = { $regex: new RegExp(keyword, "i") };
    }

    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const skip = (page - 1) * limit;

    // Step 4: Query SocialPosts
    const posts = await SocialPost.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await SocialPost.countDocuments(filter);

    res.json({
      success: true,
      count: posts.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: posts
    });
  } catch (err) {
    console.error("refreshDB Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
