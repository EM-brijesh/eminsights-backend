// models/data.js
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

    // ⭐ EXISTING FIELD
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

    analysis: {
      sentiment: { type: String },
      keywords: [String],
      engagementScore: { type: Number },
    },

    // Sentiment analysis fields
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

    sentimentAnalyzedAt: {
      type: Date,
    },

    sentimentSource: {
      type: String,
      enum: ["llm", "heuristic", "vader_reanalysis", "manual", "error"],
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

    // ⭐ NEW LOCATION FIELD (SAFE ADDITION)
    location: {
      placeId: { type: String },

      name: { type: String },

      fullName: { type: String },

      country: { type: String },

      countryCode: { type: String },

      placeType: { type: String },

      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
        },
      },
    },

    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ Existing Indexes
socialPostSchema.index({ brand: 1 });
socialPostSchema.index({ keyword: 1 });
socialPostSchema.index({ platform: 1 });
socialPostSchema.index({ createdAt: -1 });

socialPostSchema.index({
  brand: 1,
  keyword: 1,
  platform: 1,
  createdAt: -1,
});

socialPostSchema.index(
  { sourceUrl: 1, platform: 1 },
  { unique: true, sparse: true }
);

socialPostSchema.index({ sentimentAnalyzedAt: -1 });

// ⭐ GEO INDEX FOR LOCATION (SAFE)
socialPostSchema.index(
  { "location.coordinates": "2dsphere" },
  { sparse: true }
);

export const SocialPost = mongoose.model("SocialPost", socialPostSchema);