// routes/search.route.js
import express from "express";
import { searchRecent } from "../controllers/search.recent.controller.js";
import { searchHistorical } from "../controllers/search.historical.controller.js";
import { getAllKeywordsByBrand, getPostsByBrand } from "../controllers/dashboard.controllers.js";
import { runSearch, runSearchForBrand , toggleKeywordGroupStatus , runKeywordGroupSearch} from "../controllers/search.brand.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();    

router.post("/recent",protect, searchRecent);
router.post("/run", protect ,runSearchForBrand);
router.post("/brandsearch" ,protect, runSearch)
router.post("/historical",protect, searchHistorical);
router.post("/group/toggle", toggleKeywordGroupStatus);
router.post("/group/run", runKeywordGroupSearch);
// router.post("/group-run" ,protect ,runSearchForGroup)

router.get("/data",protect, getPostsByBrand)

router.get("/keywords" , protect, getAllKeywordsByBrand);
export default router;
