import cron from "node-cron";
import { Brand } from "../models/brand.js";
import axios from "axios";
import { runSentimentBackfill } from "../jobs/sentimentBackfill.js";

const freqMap = {
  "5m": "*/5 * * * *",
  "10m": "*/10 * * * *",
  "15m": "*/15 * * * *",
  "30m": "*/30 * * * *",
  "1h": "0 * * * *",
  "2h": "0 */2 * * *",
};

const BACKFILL_CRON = process.env.SENTIMENT_BACKFILL_CRON || "0 * * * *";
let isBackfillRunning = false;

export const startKeywordGroupScheduler = async () => {
  for (const [freq, cronExpr] of Object.entries(freqMap)) {
    cron.schedule(cronExpr, async () => {
      const brands = await Brand.find({ active: true });

      for (const brand of brands) {
        for (const group of brand.keywordGroups) {
          if (group.frequency === freq && group.status === "running") {
            axios.post(process.env.SEARCH_API_URL + "/api/search/group/run", {
              brandName: brand.brandName,
              groupId: group._id,
            });
          }
        }
      }
    });
  }

  if (!isBackfillRunning) {
    isBackfillRunning = true;
    try {
      const startupStats = await runSentimentBackfill({
        limit: Number(process.env.SENTIMENT_BACKFILL_BOOTSTRAP_LIMIT || 200),
      });
      console.log(
        `[Sentiment Backfill] startup run processed ${startupStats.total} posts → analyzed ${startupStats.analyzed}, saved ${startupStats.saved}`
      );
    } catch (error) {
      console.error("[Sentiment Backfill] startup job failed:", error.message);
    } finally {
      isBackfillRunning = false;
    }
  }

  cron.schedule(BACKFILL_CRON, async () => {
    if (isBackfillRunning) return;
    isBackfillRunning = true;

    try {
      const stats = await runSentimentBackfill();
      console.log(
        `[Sentiment Backfill] processed ${stats.total} posts → analyzed ${stats.analyzed}, saved ${stats.saved}`
      );
    } catch (error) {
      console.error("[Sentiment Backfill] job failed:", error.message);
    } finally {
      isBackfillRunning = false;
    }
  });
};
