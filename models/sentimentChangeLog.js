import mongoose from "mongoose";

const sentimentChangeLogSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocialPost",
      index: true,
      required: true,
    },
    oldSentiment: {
      type: String,
    },
    newSentiment: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  },
);

export const SentimentChangeLog = mongoose.model(
  "SentimentChangeLog",
  sentimentChangeLogSchema,
);

