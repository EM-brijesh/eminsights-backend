import express from "express";
import {
  createBrand,
  configureBrand,
  assignUsersToBrand,
  getBrands,
  getBrandsByUser,
  deleteBrand,
  addKeywordGroup,
  getAssignedBrands,
  updateKeywordGroupByName,
} from "../controllers/brand.controller.js";
import { protect, isAdmin } from "../middleware/auth.js";
import { canManageBrand } from "../middleware/brandAccess.js";
import { deletFromEminsights, mailPost } from "../controllers/dashboard.controllers.js";

const router = express.Router();

router.post("/create", protect, isAdmin, createBrand);
router.get("/all", protect, isAdmin, getBrands);
router.post("/assign-users", protect, isAdmin, assignUsersToBrand);
router.post("/delete", protect, isAdmin, deleteBrand);

router.post("/configure", protect, canManageBrand, configureBrand);

router.get("/user/:email", protect, getBrandsByUser);
router.post("/add-keywordgrp" , protect , addKeywordGroup)
router.get("/assigned/:email", protect, getAssignedBrands);

router.put("/keywordconfig" , protect , updateKeywordGroupByName)

router.post("/send" , mailPost)

router.delete("/delete/:postId", deletFromEminsights);

export default router;