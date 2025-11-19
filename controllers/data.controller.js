import { Brand } from "../models/brand.js";
import { SocialPost } from "../models/data.js";

/**
 * Fetch all social posts belonging to brands assigned to a specific user.
 * 
 * Query Parameters:
 * - email (required): User's email address
 * - brandName (optional): Filter by specific brand name
 * - groupName (optional): Filter by keyword group name
 * - platform (optional): Filter by platform (twitter, youtube, reddit, etc.)
 * - keyword (optional): Search for keyword in post content
 * - startDate (optional): Filter posts from this date (YYYY-MM-DD)
 * - endDate (optional): Filter posts until this date (YYYY-MM-DD)
 * - limit (optional): Number of results per page (default: 20)
 * - page (optional): Page number for pagination (default: 1)
 * - sort (optional): Sort order - 'asc' or 'desc' (default: 'desc')
 */
export const getUserSocialPosts = async (req, res) => {
  try {
    const {
      email,                // user's email (required)
      brandName,            // optional - filter by specific brand
      groupName,            // optional - filter by keyword group
      platform,             // optional - twitter, youtube, reddit...
      keyword,              // optional - filter by keyword in content
      startDate,            // optional - filter posts from this date
      endDate,              // optional - filter posts until this date
      limit = 20,           // pagination
      page = 1,             // pagination
      sort = "desc"         // sort by newest first
    } = req.query;

    if (!email)
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });

    // Normalize email for case-insensitive matching
    const normalizedEmail = String(email).toLowerCase().trim();
    console.log(`[getUserSocialPosts] Searching for email: "${normalizedEmail}"`);

    // 🔍 Step 1: find all brands assigned to this user (case-insensitive)
    // Get all brands and filter in memory for case-insensitive matching
    const allBrands = await Brand.find({}).select("_id brandName assignedUsers keywordGroups");
    
    const userBrands = allBrands.filter(brand => {
      const directMatch = (brand.assignedUsers || []).some(
        u => String(u).toLowerCase() === normalizedEmail
      );
      const groupMatch = (brand.keywordGroups || []).some(group => 
        (group.assignedUsers || []).some(
          u => String(u).toLowerCase() === normalizedEmail
        )
      );
      return directMatch || groupMatch;
    });

    console.log(`[getUserSocialPosts] Found ${userBrands.length} brands for email "${normalizedEmail}"`);

    if (!userBrands.length) {
      // Return empty data instead of 404 - user might not have brands yet
      return res.json({
        success: true,
        user: email,
        brandFilter: [],
        count: 0,
        totalBrands: 0,
        data: [],
        message: "No brands assigned to this user"
      });
    }

    // build brandId filter
    let brandFilter = userBrands.map((b) => b._id);

    if (brandName) {
      const selectedBrand = userBrands.find(
        (b) => b.brandName.toLowerCase() === brandName.toLowerCase()
      );
      if (!selectedBrand)
        return res.status(400).json({
          success: false,
          message: `Brand '${brandName}' is not assigned to this user`
        });
      brandFilter = [selectedBrand._id];
    }

    // Filter by groupName if provided
    if (groupName) {
      const brandsWithGroup = userBrands.filter(brand =>
        (brand.keywordGroups || []).some(
          group => group.name?.toLowerCase() === groupName.toLowerCase()
        )
      );
      if (brandsWithGroup.length === 0) {
        return res.status(400).json({
          success: false,
          message: `No brands found with group '${groupName}' for this user`
        });
      }
      brandFilter = brandsWithGroup.map(b => b._id);
    }

    // 🔍 Step 2: query SocialPosts
    const filter = { brand: { $in: brandFilter } };
    if (platform) filter.platform = platform;

    // Filter by keyword in content (case-insensitive search)
    if (keyword) {
      filter.$or = [
        { "content.text": { $regex: keyword, $options: "i" } },
        { "content.description": { $regex: keyword, $options: "i" } }
      ];
    }

    // Filter by date range
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Include the entire end date
        filter.createdAt.$lte = end;
      }
    }

    const sortOrder = sort === "asc" ? 1 : -1;
    const posts = await SocialPost.find(filter)
      .populate("brand", "brandName")
      .sort({ createdAt: sortOrder })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .exec();

    const response = {
      success: true,
      user: email,
      brandFilter: brandName || userBrands.map((b) => b.brandName),
      count: posts.length,
      totalBrands: userBrands.length,
      data: posts
    };

    // Include applied filters in response
    if (groupName) response.groupName = groupName;
    if (platform) response.platform = platform;
    if (keyword) response.keyword = keyword;
    if (startDate) response.startDate = startDate;
    if (endDate) response.endDate = endDate;

    res.json(response);
  } catch (err) {
    console.error("Error fetching user social posts:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


