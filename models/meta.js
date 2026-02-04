import mongoose from "mongoose";

const MetaAccountSchema = new mongoose.Schema({
  pageId: { type: String, required: true, unique: true },
  pageName: { type: String },
  pageAccessToken: { type: String, required: true },
  
  // Instagram fields
  instagramBusinessId: { type: String, required: true },
  instagramUsername: { type: String }, // NEW - @username for display
  instagramName: { type: String }, // NEW - Full name for display
  instagramProfilePicture: { type: String }, // NEW - Profile picture URL
  instagramFollowers: { type: Number }, // NEW - Follower count
  instagramMediaCount: { type: Number }, // NEW - Post count
  
  isActive: { type: Boolean, default: true },
  connectedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster lookups
MetaAccountSchema.index({ pageId: 1 });

export default mongoose.model("MetaAccount", MetaAccountSchema);