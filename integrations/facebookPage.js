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

    console.log("Incoming pageId:", pageId);
    console.log("Type of pageId:", typeof pageId);

    const page = await FacebookPage.findOne({ pageId });

    console.log("DB result:", page);

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
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