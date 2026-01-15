import mongoose from "mongoose";

const MetaAccountSchema = new mongoose.Schema({
  pageId: { type: String, required: true, unique: true },
  pageName: { type: String },
  pageAccessToken: { type: String, required: true },
  instagramBusinessId: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  connectedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster lookups
MetaAccountSchema.index({ userId: 1 });

export default mongoose.model("MetaAccount", MetaAccountSchema);