import mongoose from "mongoose";
import { Brand } from "../models/brand.js";

const normalizeStringArray = (value, { lowercase = false } = {}) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item !== "string") return "";
      const trimmed = item.trim();
      return lowercase ? trimmed.toLowerCase() : trimmed;
    })
    .filter(Boolean);
};

const sanitizeKeywordGroupPayload = (group) => {
  if (!group) return null;
  const resolvedName = (group.groupName || group.name || "").trim();
  if (!resolvedName) return null;

  const keywords = normalizeStringArray(group.keywords);
  if (keywords.length === 0) return null;

  const includeKeywords = normalizeStringArray(group.includeKeywords);
  const excludeKeywords = normalizeStringArray(group.excludeKeywords);
  const platforms = normalizeStringArray(group.platforms, { lowercase: true });
  const assignedUsers = normalizeStringArray(group.assignedUsers, { lowercase: true });
  const language = group.language || group.languages?.[0] || "en";
  const country = group.country || group.countries?.[0] || "IN";
  const frequency = group.frequency || "30m";

  const payload = {
    groupName: resolvedName,
    name: resolvedName,
    keywords,
    includeKeywords,
    excludeKeywords,
    platforms,
    language,
    country,
    frequency,
    assignedUsers,
    paused: !!group.paused,
    status: group.status || (group.paused ? "paused" : "running"),
  };

  const potentialId = group._id || group.mongoId || group.id;
  if (potentialId && mongoose.Types.ObjectId.isValid(potentialId)) {
    payload._id = new mongoose.Types.ObjectId(potentialId);
  }

  return payload;
};

/* ---------------------------------------------------
   CREATE BRAND (Brand-level metadata only)
--------------------------------------------------- */
export const createBrand = async (req, res) => {
  try {
    const { brandName, description } = req.body;

    if (!brandName)
      return res.status(400).json({ success: false, message: "Brand name is required" });

    const normalizedName = brandName.trim();

    const existing = await Brand.findOne({
      brandName: new RegExp(`^${normalizedName}$`, "i"),
    });

    if (existing)
      return res.status(400).json({ success: false, message: "Brand already exists" });

    const brand = await Brand.create({
      brandName: normalizedName,
      description,
    });

    res.json({ success: true, brand });
  } catch (err) {
    console.error("Create Brand Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------------------------------------------
   ASSIGN USERS TO BRAND (Brand admin users)
--------------------------------------------------- */
export const assignUsersToBrand = async (req, res) => {
  try {
    const { brandName, users = [] } = req.body;

    if (!brandName)
      return res.status(400).json({ success: false, message: "brandName is required" });

    if (!Array.isArray(users))
      return res.status(400).json({ success: false, message: "users must be an array" });

    const brand = await Brand.findOne({
      brandName: new RegExp(`^${brandName}$`, "i"),
    });

    if (!brand)
      return res.status(404).json({ success: false, message: "Brand not found" });

    const normalizedEmails = users.map(u => u.toLowerCase().trim()).filter(Boolean);

    // brand.assignedUsers = Array.from(new Set([
    //   ...brand.assignedUsers,
    //   ...normalizedEmails
    // ]));
    //asign user -fix 
    brand.assignedUsers = normalizedEmails;  // <-- overwrite array

    await brand.save();

    res.json({
      success: true,
      message: "Users assigned to brand",
      assignedUsers: brand.assignedUsers,
    });
  } catch (err) {
    console.error("Assign Users Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------------------------------------------
   UPDATE BRAND (Brand metadata only)
--------------------------------------------------- */
export const configureBrand = async (req, res) => {
  try {
    const {
      brandName,
      description,
      aiFriendlyName,
      avatarUrl,
      brandColor,
      ticketCreation,
      assignedUsers,   // REMOVE default ≠ [] (important fix)
      language,
      country,
      active,
      keywords,
      platforms,
      includeKeywords,
      excludeKeywords,
      keywordGroups,
    } = req.body;

    if (!brandName)
      return res.status(400).json({ success: false, message: "brandName is required" });

    const brand = await Brand.findOne({
      brandName: new RegExp(`^${brandName}$`, "i"),
    });

    if (!brand)
      return res.status(404).json({ success: false, message: "Brand not found" });

    // -------- Update metadata --------
    if (typeof description === "string") brand.description = description.trim();
    if (typeof aiFriendlyName === "string") brand.aiFriendlyName = aiFriendlyName.trim();
    if (typeof avatarUrl === "string") brand.avatarUrl = avatarUrl;
    if (typeof brandColor === "string") brand.brandColor = brandColor;
    if (typeof ticketCreation === "boolean") brand.ticketCreation = ticketCreation;
    if (typeof language === "string") brand.language = language;
    if (typeof country === "string") brand.country = country;
    if (Array.isArray(keywords)) {
      brand.keywords = keywords.map((k) => String(k).trim()).filter(Boolean);
    }
    if (Array.isArray(platforms)) {
      brand.platforms = platforms.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
    }
    if (Array.isArray(includeKeywords)) {
      brand.includeKeywords = includeKeywords.map((k) => String(k).trim()).filter(Boolean);
    }
    if (Array.isArray(excludeKeywords)) {
      brand.excludeKeywords = excludeKeywords.map((k) => String(k).trim()).filter(Boolean);
    }
    if (typeof active === "boolean") brand.active = active;

    if (Array.isArray(keywordGroups)) {
      const sanitizedGroups = keywordGroups
        .map(sanitizeKeywordGroupPayload)
        .filter(Boolean);
      brand.keywordGroups = sanitizedGroups;
    }

    // -------- SAFE USER UPDATE --------
    // Only update assignedUsers when array exists AND has values
    if (Array.isArray(assignedUsers) && assignedUsers.length > 0) {
      const normalized = assignedUsers
        .map(u => u.toLowerCase().trim())
        .filter(Boolean);

      brand.assignedUsers = Array.from(
        new Set([...brand.assignedUsers, ...normalized])
      );
    }

    await brand.save();

    res.json({
      success: true,
      message: "Brand updated successfully",
      brand,
    });

  } catch (err) {
    console.error("Configure Brand Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------------------------------------------
   GET ALL BRANDS (with keyword groups)
--------------------------------------------------- */
export const getBrands = async (req, res) => {
  try {
    const brands = await Brand.find({}).lean();
    res.json({ success: true, count: brands.length, brands });
    console.log("🔥 getBrands fetched:", JSON.stringify(brands, null, 2));
  } catch (err) {
    console.error("getBrands Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------------------------------------------
   GET BRANDS ASSIGNED TO A USER
--------------------------------------------------- */
export const getBrandsByUser = async (req, res) => {
  try {
    const { email } = req.params;
    const normalizedEmail = email.toLowerCase().trim();

    const brands = await Brand.find({
      $or: [
        { assignedUsers: normalizedEmail },
        { "keywordGroups.assignedUsers": normalizedEmail }
      ]
    });

    res.json({ success: true, count: brands.length, brands });
  } catch (err) {
    console.error("getBrandsByUser Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ---------------------------------------------------
   DELETE BRAND
--------------------------------------------------- */
// controllers/brand.controller.js (update)
export const deleteBrand = async (req, res) => {
  try {
    console.log("🔥 deleteBrand controller called. req.body:", req.body);

    const { brandName } = req.body;
    if (!brandName) {
      return res.status(400).json({ success: false, message: "brandName required" });
    }

    // find and delete atomically (case-insensitive)
    const deleted = await Brand.findOneAndDelete({
      brandName: new RegExp(`^${brandName}$`, "i")
    });

    if (!deleted) {
      console.log("💡 No brand matched for:", brandName);
      return res.status(404).json({ success: false, message: "Brand not found" });
    }

    console.log("✅ Brand deleted:", deleted.brandName, "id:", deleted._id);
    return res.json({
      success: true,
      message: "Brand deleted",
      brandName: deleted.brandName,
      _id: deleted._id
    });
  } catch (err) {
    console.error("Delete Brand Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


/* ---------------------------------------------------
   ADD KEYWORD GROUP TO BRAND
--------------------------------------------------- */
export const addKeywordGroup = async (req, res) => {
  try {
    const {
      brandName,
      groupName,
      keywords,
      includeKeywords = [],
      excludeKeywords = [],
      platforms = [],
      language = "en",
      country = "IN",
      frequency = "30m",
      assignedUsers = []
    } = req.body;

    if (!brandName || !groupName || !keywords?.length)
      return res.status(400).json({
        success: false,
        message: "brandName, groupName and keywords are required"
      });

    const brand = await Brand.findOne({ brandName });

    if (!brand)
      return res.status(404).json({ success: false, message: "Brand not found" });

    const exists = brand.keywordGroups.find(
      (g) => g.groupName.toLowerCase() === groupName.toLowerCase()
    );

    if (exists)
      return res.status(400).json({
        success: false,
        message: `Keyword group '${groupName}' already exists`
      });

    brand.keywordGroups.push({
      groupName,
      keywords,
      includeKeywords,
      excludeKeywords,
      platforms,
      language,
      country,
      frequency,
      assignedUsers,
      status: "running",
      lastRun: null,
      nextRun: new Date()
    });

    await brand.save();

    res.json({
      success: true,
      message: "Keyword group added successfully",
      brand
    });
  } catch (err) {
    console.error("Add Keyword Group Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

//dashboard route -fix
export const getAssignedBrands = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const brands = await Brand.find({
      assignedUsers: { $elemMatch: { $regex: new RegExp(`^${normalizedEmail}$`, "i") } },
    }).lean();
    res.json({ success: true, brands, count: brands.length });
  } catch (err) {
    console.error("Error fetching assigned brands:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


//keyword-configure
export const updateKeywordGroupByName = async (req, res) => {
  try {
    const {
      brandName,
      groupName,
      originalGroupName,
      keywords,
      includeKeywords,
      excludeKeywords,
      platforms,
      language,
      country,
      frequency,
      assignedUsers
    } = req.body;

    if (!brandName)
      return res.status(400).json({ success: false, message: "brandName is required" });

    if (!groupName)
      return res.status(400).json({ success: false, message: "groupName is required" });

    // Find brand
    const brand = await Brand.findOne({ brandName });
    if (!brand)
      return res.status(404).json({ success: false, message: "Brand not found" });

    // --------------------------
    // 1️⃣ UPDATE EXISTING GROUP
    // --------------------------
    let group;

    if (originalGroupName) {
      group = brand.keywordGroups.find(
        (g) => g.groupName?.toLowerCase() === originalGroupName.toLowerCase()
      );
    }

    if (group) {
      // Update only provided fields
      group.groupName = groupName.trim();
      group.name = groupName.trim();

      if (Array.isArray(keywords)) {
        group.keywords = keywords.map((k) => k.trim());
      }
      if (Array.isArray(includeKeywords)) {
        group.includeKeywords = includeKeywords.map((k) => k.trim());
      }
      if (Array.isArray(excludeKeywords)) {
        group.excludeKeywords = excludeKeywords.map((k) => k.trim());
      }
      if (Array.isArray(platforms)) {
        group.platforms = platforms.map((p) => p.trim().toLowerCase());
      }
      if (language) group.language = language;
      if (country) group.country = country;
      if (frequency) group.frequency = frequency;

      if (Array.isArray(assignedUsers)) {
        group.assignedUsers = Array.from(
          new Set(assignedUsers.map((u) => u.trim().toLowerCase()))
        );
      }
    }

    // --------------------------
    // 2️⃣ CREATE NEW GROUP
    // --------------------------
    if (!group) {
      brand.keywordGroups.push({
        groupName: groupName.trim(),
        name: groupName.trim(),
        keywords: keywords || [],
        includeKeywords: includeKeywords || [],
        excludeKeywords: excludeKeywords || [],
        platforms: platforms || [],
        language: language || "en",
        country: country || "IN",
        frequency: frequency || "30m",
        assignedUsers: Array.isArray(assignedUsers)
          ? assignedUsers.map((u) => u.trim().toLowerCase())
          : [],
        status: "paused",
        paused: true,
      });
    }

    await brand.save();

    return res.json({
      success: true,
      message: group ? "Keyword group updated" : "Keyword group created",
      brand,
    });

  } catch (err) {
    console.error("keywordConfig Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};



