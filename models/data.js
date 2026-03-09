import mongoose from "mongoose";

const socialPostSchema = new mongoose.Schema(
  {
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },

    keyword: { type: String, required: true },

    platform: {
      type: String,
      enum: ["twitter", "youtube", "reddit", "google", "facebook", "instagram"],
      required: true,
    },

    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    groupName: {
      type: String,
      required: true,
      trim: true,
    },

    createdAt: { type: Date, required: true },

    author: {
      id: { type: String },
      name: { type: String },
      username: { type: String },
      profileImage: { type: String },
    },

    content: {
      text: { type: String },
      description: { type: String },
      mediaUrl: { type: String },
    },

    metrics: {
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
    },

    sourceUrl: { type: String },

    // ✅ FIX: tweetId stored separately — always present for Twitter posts,
    // used as the reliable unique dedup key instead of sourceUrl (which can be null)
    tweetId: { type: String },

    analysis: {
      sentiment: { type: String },
      keywords: [String],
      engagementScore: { type: Number },
    },

    location: {
      placeId: { type: String },
      fullName: { type: String },
      country: { type: String },
      countryCode: { type: String },
      placeType: { type: String },
    },

    sentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
      index: true,
    },

    sentimentScore: {
      type: Number,
      min: 0,
      max: 1,
    },

    sentimentAnalyzedAt: { type: Date },

    sentimentSource: {
      type: String,
      enum: ["llm", "llm_google", "heuristic", "vader_reanalysis", "manual", "error"],
      index: true,
      default: "llm",
    },

    sentimentIsManual: {
      type: Boolean,
      default: false,
      index: true,
    },

    language: {
      type: String,
      index: true,
    },

    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ Performance indexes
socialPostSchema.index({ brand: 1 });
socialPostSchema.index({ keyword: 1 });
socialPostSchema.index({ platform: 1 });
socialPostSchema.index({ createdAt: -1 });
socialPostSchema.index({ brand: 1, keyword: 1, platform: 1, createdAt: -1 });
socialPostSchema.index({ sentimentAnalyzedAt: -1 });
socialPostSchema.index({ "location.countryCode": 1 });
socialPostSchema.index({ "location.placeType": 1 });

// ✅ FIX: Two separate dedup indexes:
//
// 1. sourceUrl index — uses partialFilterExpression so null/undefined sourceUrls
//    are completely ignored by the index (sparse:true still indexes null, causing E11000).
//    NOTE: You MUST manually drop the old index first (see fixIndexes.js).
socialPostSchema.index(
  { sourceUrl: 1, platform: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceUrl: { $type: "string" } },
  }
);

// 2. tweetId index — catches Twitter duplicates even when sourceUrl is null
socialPostSchema.index(
  { tweetId: 1, platform: 1 },
  {
    unique: true,
    sparse: true, // safe here — tweetId is never null when present, just absent for non-Twitter
  }
);

export const SocialPost = mongoose.model("SocialPost", socialPostSchema);