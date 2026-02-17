import { FacebookPage } from "../models/facebookPage.js";

export const insertFBpage = async (pageId, pageName) => {
  if (!pageId || !pageName) {
    throw new Error("pageId and pageName are required");
  }

  const page = await FacebookPage.findOneAndUpdate(
    { pageId },
    {
      pageId,
      pageName: pageName.trim(),
    },
    {
      upsert: true,       // create if not exists
      new: true,          // return updated document
      setDefaultsOnInsert: true,
    }
  );

  return page;
};
