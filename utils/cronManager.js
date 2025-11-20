import cron from "node-cron";
import { Brand } from "../models/brand.js";
import axios from "axios";

const activeJobs = {}; // Store active cron jobs

// Convert "30m", "1h" → cron syntax
function convertFrequencyToCron(freq) {
  const map = {
    "5m": "*/5 * * * *",
    "10m": "*/10 * * * *",
    "15m": "*/15 * * * *",
    "30m": "*/30 * * * *",
    "1h": "0 */1 * * *",
    "2h": "0 */2 * * *",
    "4h": "0 */4 * * *",
    "6h": "0 */6 * * *",
    "12h": "0 */12 * * *",
    "24h": "0 0 * * *",
  };

  return map[freq] || "*/30 * * * *"; // default = 30m
}

// Create a cron job for a specific keyword group
export async function scheduleKeywordGroup(brand, group) {
  const key = `${brand.brandName}_${group.groupName}`;

  // Remove existing job if any
  if (activeJobs[key]) {
    activeJobs[key].stop();
    delete activeJobs[key];
  }

  // If group is paused → don't schedule anything
  if (group.status === "paused" || group.paused === true) {
    console.log(`⏸ Skipping schedule for paused group: ${key}`);
    return;
  }

  const cronExpr = convertFrequencyToCron(group.frequency);

  console.log(`⏳ Scheduling group ${key} with cron: ${cronExpr}`);

  const job = cron.schedule(cronExpr, async () => {
    console.log(`🚀 Running scheduled job for group: ${key}`);

    try {
      await axios.post(process.env.SEARCH_API_URL +"/api/search/group/run", {
        brandName: brand.brandName,
        groupName: group.groupName,
      });
    } catch (err) {
      console.error("❌ Scheduled job error:", err.message);
    }
  });

  activeJobs[key] = job;
}

// Load all groups on server start
export async function scheduleAllGroups() {
  console.log("🔄 Loading all keyword groups...");

  const brands = await Brand.find({});
  for (const brand of brands) {
    for (const group of brand.keywordGroups) {
      await scheduleKeywordGroup(brand, group);
    }
  }

  console.log("✅ All groups scheduled.");
}
