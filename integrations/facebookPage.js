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


export const getFacebookPages = async (req, res) => {
  try {
    const pages = await FacebookPage.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: pages.length,
      data: pages,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const toggleFacebookPageStatus = async (req, res) => {
  try {
    const { pageId } = req.params;

    const isObjectId = /^[a-f\d]{24}$/i.test(pageId);
    const page = isObjectId
      ? (await FacebookPage.findById(pageId)) ?? (await FacebookPage.findOne({ pageId }))
      : await FacebookPage.findOne({ pageId });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: `Page not found for identifier: ${pageId}`,
      });
    }

    page.isActive = !page.isActive;
    await page.save();

    res.status(200).json({
      success: true,
      message: `Page is now ${page.isActive ? "Active" : "Inactive"}`,
      data: page,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};