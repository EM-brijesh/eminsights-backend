// controllers/data.controller.js
import { Brand } from "../models/brand.js";
import { SocialPost } from "../models/data.js";
import nodemailer from "nodemailer";

//mail template :




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

export const mailPost = async (req, res) => {
  try {
    // Support both JSON bodies and multipart/form-data (attachments)
    const { email, postId, subject, message } = req.body;

    if (!email || !postId || !subject) {
      return res.status(400).json({
        success: false,
        message: "email, postId and subject are required",
      });
    }

    const post = await SocialPost.findById(postId).lean();
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const html = buildPostEmailHTML({
      post,
      userMessage: message
    });

    // Map any uploaded files into nodemailer attachments
    const attachments =
      Array.isArray(req.files) && req.files.length
        ? req.files.map((file) => ({
            filename: file.originalname,
            content: file.buffer,
            contentType: file.mimetype,
          }))
        : [];

    await transporter.sendMail({
      to: email,
      from: process.env.SMTP_USER,
      subject,
      html,
      // Works for any file type (mp4, jpg, png, gif, svg, mp3, pdf, etc.)
      attachments,
    });

    return res.json({ success: true, message: "Post emailed successfully" });
  } catch (err) {
    console.error("mailPost error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ----------------- HELPERS ----------------- */

function getYouTubeVideoId(url) {
  if (!url) return null;

  const match = url.match(
    /(?:youtube\.com\/.*v=|youtu\.be\/)([^&?/]+)/
  );

  return match ? match[1] : null;
}

/**
 * Builds email-safe HTML
 */
function buildPostEmailHTML({ post, userMessage }) {
  const {
    platform,
    author = {},
    content = {},
    metrics = {},
    sourceUrl,
    createdAt,
    analysis = {}
  } = post;

  const isYouTube = platform === "youtube";
  const ytId = isYouTube ? getYouTubeVideoId(sourceUrl) : null;
  const ytThumb = ytId
    ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
    : null;

  const sentimentColor =
    analysis.sentiment === "positive"
      ? "#22c55e"
      : analysis.sentiment === "negative"
      ? "#ef4444"
      : "#eab308";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Social Mention</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;color:#e5e7eb;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px">
        <table width="600" style="background:#020617;border-radius:12px;padding:20px">

          <!-- Header -->
          <tr>
            <td style="font-size:18px;font-weight:bold;padding-bottom:12px">
              🔔 New ${platform.toUpperCase()} Mention
            </td>
          </tr>

          <!-- User Message -->
          ${
            userMessage
              ? `<tr><td style="background:#020617;border-left:4px solid #38bdf8;padding:12px;margin-bottom:16px">
                  <strong>User message:</strong><br/>${userMessage}
                </td></tr>`
              : ""
          }

          <!-- Author -->
          <tr>
            <td style="padding-top:12px">
              <strong>${author.name || "Unknown"}</strong>
              <span style="color:#94a3b8"> @${author.username || "user"}</span>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:12px 0">
              ${content.text || ""}
            </td>
          </tr>

          <!-- YouTube Preview -->
          ${
            ytThumb
              ? `<tr>
                  <td>
                    <a href="${sourceUrl}" target="_blank">
                      <img src="${ytThumb}" alt="YouTube thumbnail"
                        style="width:100%;border-radius:8px" />
                    </a>
                  </td>
                </tr>`
              : ""
          }

          <!-- Metrics -->
          <tr>
            <td style="padding:12px 0;color:#cbd5f5;font-size:14px">
              👍 ${metrics.likes || 0}
              &nbsp;&nbsp;💬 ${metrics.comments || 0}
              &nbsp;&nbsp;👁️ ${metrics.views || 0}
            </td>
          </tr>

          <!-- Sentiment -->
          ${
            analysis.sentiment
              ? `<tr>
                  <td style="padding:8px 0">
                    <span style="background:${sentimentColor};color:#020617;padding:6px 10px;border-radius:999px;font-size:12px">
                      ${analysis.sentiment.toUpperCase()}
                    </span>
                  </td>
                </tr>`
              : ""
          }

          <!-- Footer -->
          <tr>
            <td style="padding-top:16px;font-size:12px;color:#64748b">
              Posted on ${new Date(createdAt).toLocaleString()}
              <br/>
              <a href="${sourceUrl}" target="_blank" style="color:#38bdf8">
                View original post
              </a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export const deletFromEminsights = async (req, res) => {
  const { postId } = req.params; // ✅ FIX

  if (!postId) {
    return res.status(400).json({
      success: false,
      message: "postId is required",
    });
  }

  try {
    const deletedPost = await SocialPost.findByIdAndDelete(postId);

    if (!deletedPost) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    return res.json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (err) {
    console.error("deletFromEminsights error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
