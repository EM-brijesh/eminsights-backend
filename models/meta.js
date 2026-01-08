import mongoose from "mongoose";

const MetaAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // 🆕 ADD THIS: Link to brand
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand"
    },

    pageId: {
      type: String,
      required: true
    },

    pageName: {
      type: String
    },

    pageAccessToken: {
      type: String,
      required: true
    },

    instagramBusinessId: {
      type: String,
      required: true
    },

    connectedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// 🆕 ADD INDEX for faster lookups
MetaAccountSchema.index({ brand: 1 });
MetaAccountSchema.index({ userId: 1 });

export default mongoose.model("MetaAccount", MetaAccountSchema);
