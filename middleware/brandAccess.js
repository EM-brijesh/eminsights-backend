import { Brand } from "../models/brand.js";

// Allow if admin, or if user's email is assigned to the brand directly or via any keyword group
export const canManageBrand = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: "Auth required" });
    if (user.role === "admin") return next();

    const brandName = req.body?.brandName || req.params?.brandName;
    if (!brandName) {
      return res.status(400).json({ success: false, message: "brandName is required" });
    }

    // Case-insensitive brand name matching
    const brand = await Brand.findOne({ 
      brandName: { $regex: new RegExp(`^${brandName}$`, 'i') }
    }).select("assignedUsers keywordGroups.brandName keywordGroups.assignedUsers");
    if (!brand) {
      console.log(`[canManageBrand] Brand not found: "${brandName}"`);
      return res.status(404).json({ success: false, message: `Brand "${brandName}" not found` });
    }

    const email = user.email;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email not found in user data" });
    }
    
    // Case-insensitive matching
    const normalizedEmail = String(email).toLowerCase().trim();
    const direct = (brand.assignedUsers || []).some(
      u => String(u).toLowerCase() === normalizedEmail
    );
    const viaGroup = (brand.keywordGroups || []).some(g => 
      (g.assignedUsers || []).some(
        u => String(u).toLowerCase() === normalizedEmail
      )
    );

    if (direct || viaGroup) return next();

    return res.status(403).json({ success: false, message: "Access denied for this brand" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


