// models/brand.js
import mongoose from "mongoose";

const SUPPORTED_PLATFORMS = ["youtube", "twitter", "reddit", "facebook", "instagram", "quora"];
const SUPPORTED_FREQUENCIES = ["5m", "10m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "24h"];

const keywordGroupSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    groupName: { type: String, trim: true },
    keywords: [{ type: String, trim: true, required: true }],
    includeKeywords: [{ type: String, trim: true, default: [] }],
    excludeKeywords: [{ type: String, trim: true, default: [] }],
    platforms: [{ type: String, enum: SUPPORTED_PLATFORMS }],
    language: { type: String, default: "en" },
    country: { type: String, default: "IN" },
    frequency: {
      type: String,
      enum: SUPPORTED_FREQUENCIES,
      default: "30m",
    },
    status: {
      type: String,
      enum: ["running", "paused"],
      default: "paused",
    },
    paused: { type: Boolean, default: false },
    lastRun: { type: Date },
    nextRun: { type: Date },
  },
  { _id: true }
);

keywordGroupSchema.pre("validate", function syncGroupName(next) {
  if (!this.name && this.groupName) {
    this.name = this.groupName;
  }
  if (!this.groupName && this.name) {
    this.groupName = this.name;
  }
  next();
});

const brandSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true, unique: true, trim: true },
    description: { type: String },
    avatarUrl: { type: String },
    brandColor: { type: String },
    aiFriendlyName: { type: String },
    ticketCreation: { type: Boolean, default: false },
    keywordGroups: [keywordGroupSchema],
    assignedUsers: [{ type: String, trim: true }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Brand = mongoose.model("Brand", brandSchema);
