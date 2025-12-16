// controllers/data.controller.js
import { Brand } from "../models/brand.js";
import { SocialPost } from "../models/data.js";
import nodemailer from "nodemailer";

//mail template :
const buildPostEmailHTML = ({
  authorName,
  content,
  platform,
  createdAt,
  mentionId,
  postUrl,
  userMessage
}) => {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#ffffff; padding:24px;">
    <div style="max-width:720px;margin:0 auto;">
      <p style="font-size:14px; color:#111; margin:0 0 8px 0;">Hi Team,</p>
      <p style="font-size:14px; color:#111; margin:0 0 16px 0;">
        ${userMessage || "Kindly assist on the below case:"}
      </p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />

      <div style="background:#f9fafb;border-radius:8px;padding:16px;">
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
          <!-- Header -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 4px 0;">
            <tr>
              <td style="font-weight:600;font-size:14px;color:#111;padding:0;margin:0;">
                ${authorName}
              </td>
              <td style="font-size:12px;color:#64748b;text-align:right;white-space:nowrap;padding:0;margin:0;">
                ${new Date(createdAt).toLocaleString()}
              </td>
            </tr>
          </table>

          <!-- Content -->
          <div style="margin-top:12px;font-size:14px;color:#111;line-height:1.6;">
            ${content}
          </div>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />

          <!-- Footer / CTA (centered, email-client friendly button) -->
          <div style="text-align:center;font-size:13px;color:#111;margin-top:8px;">
            <div style="margin-bottom:8px;">
              <strong>${platform === "twitter" ? "X" : platform}</strong>
              <span style="color:#64748b;"> · Mention ID: ${mentionId}</span>
            </div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
              <tr>
                <td bgcolor="#2563eb" align="center" style="border-radius:999px;">
                  <a
                    href="${postUrl}"
                    target="_blank"
                    style="
                      display:inline-block;
                      padding:10px 28px;
                      border-radius:999px;
                      background-color:#2563eb;
                      color:#ffffff;
                      font-size:14px;
                      font-weight:600;
                      text-decoration:none;
                      white-space:nowrap;
                    "
                  >
                    View Post
                  </a>
                </td>
              </tr>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
  `;
};



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
      authorName: post.author?.name || "Unknown",
      authorHandle: post.author?.username || "user",
      authorAvatar: post.author?.avatar || "https://ui-avatars.com/api/?name=User",
      content: post.content?.text || "",
      platform: post.platform,
      createdAt: post.createdAt,
      mentionId: post._id,
      postUrl: post.sourceUrl,
      userMessage: message,
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

    res.json({ success: true, message: "Post emailed successfully" });
  } catch (err) {
    console.error("mailPost error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

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
