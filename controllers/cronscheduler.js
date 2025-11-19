// import cron from "node-cron";
// import { Brand } from "../models/brand.js";
// import axios from "axios"; 

// const freqMap = {
//   "5m": "*/5 * * * *",
//   "10m": "*/10 * * * *",
//   "15m": "*/15 * * * *",
//   "30m": "*/30 * * * *",
//   "1h": "0 * * * *",
//   "2h": "0 */2 * * *",
// };

// export const startKeywordGroupScheduler = async () => {
//   for (const [freq, cronExpr] of Object.entries(freqMap)) {
//     cron.schedule(cronExpr, async () => {
//       const brands = await Brand.find({ active: true });

//       for (const brand of brands) {
//         for (const group of brand.keywordGroups) {
//           if (group.frequency === freq && group.status === "running") {
//             axios.post("http://api.eminsights.in/api/search/group-run", {
//               brandName: brand.brandName,
//               groupId: group._id,
//             });
//           }
//         }
//       }
//     });
//   }
// };
