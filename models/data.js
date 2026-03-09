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

    // ✅ FIX #2: Added username and profileImage fields.
    // Previously Mongoose silently dropped these because they
    // weren't defined in the schema, even when the data was correct.
    author: {
      id: { type: String },
      name: { type: String },
      username: { type: String },       // ✅ ADDED
      profileImage: { type: String },   // ✅ ADDED
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

    sentimentAnalyzedAt: {
      type: Date,
    },

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

    // ✅ FIX #3: language was being fetched (tweet.lang) but never saved
    // because the schema field existed but doc.language was never assigned
    // in the controller. Schema was fine — controller mapping was the gap.
    language: {
      type: String,
      index: true,
    },

    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ Indexes for performance
socialPostSchema.index({ brand: 1 });
socialPostSchema.index({ keyword: 1 });
socialPostSchema.index({ platform: 1 });
socialPostSchema.index({ createdAt: -1 });
socialPostSchema.index({ brand: 1, keyword: 1, platform: 1, createdAt: -1 });

// Prevent duplicate posts
socialPostSchema.index(
  { sourceUrl: 1, platform: 1 },
  { unique: true, sparse: true }
);

socialPostSchema.index({ sentimentAnalyzedAt: -1 });

// Location indexes
socialPostSchema.index({ "location.countryCode": 1 });
socialPostSchema.index({ "location.placeType": 1 });

export const SocialPost = mongoose.model("SocialPost", socialPostSchema);