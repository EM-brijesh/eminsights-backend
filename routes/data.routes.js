import express from "express";
import {
//   getDataByKeyword,
//   getAllKeywords,
  getUserSocialPosts
} from "../controllers/data.controller.js";
import { protect } from "../middleware/auth.js";
import { refreshDB } from "../controllers/dashboard.controllers.js";

const router = express.Router();

// router.get("/data", getDataByKeyword);
// router.get("/data/keywords", getAllKeywords);
router.get("/user-posts", getUserSocialPosts);

// New endpoint with alternative path - uses same controller
router.get("/get-data", getUserSocialPosts);
router.get("/get-data/", getUserSocialPosts);

//refresh dashboard
router.get('/refreshbrand' , protect , refreshDB)

export default router;