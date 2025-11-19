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
      enum: ["twitter", "youtube", "reddit"],
      required: true,
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

    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ Indexing for performance
socialPostSchema.index({ brand: 1 });
socialPostSchema.index({ keyword: 1 });
socialPostSchema.index({ platform: 1 });
socialPostSchema.index({ createdAt: -1 });
socialPostSchema.index({ brand: 1, keyword: 1, platform: 1, createdAt: -1 });

export const SocialPost = mongoose.model("SocialPost", socialPostSchema);
