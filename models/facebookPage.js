// models/facebookPage.js
import mongoose from "mongoose";

const facebookPageSchema = new mongoose.Schema(
  {
    pageId: {
      type: String,
      required: true,
      unique: true,
    },

    pageName: {
      type: String,
      required: true,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastFetchedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export const FacebookPage = mongoose.model(
  "FacebookPage",
  facebookPageSchema
);
