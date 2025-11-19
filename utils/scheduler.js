// //This needs to be changed 


// import cron from "node-cron";
// import axios from "axios";

// /**
//  * Schedule an automatic search
//  * @param {String} keyword
//  * @param {Array} platforms - ["twitter", "youtube", "reddit"]
//  * @param {Object} options - include/exclude keywords, language, etc.
//  */
// export const scheduleSearchJob = (keyword, platforms, options = {}) => {
//   const { frequency = "30m" } = options;

//   // Convert human frequency to cron pattern
//   const cronPattern =
//     frequency === "5m"
//       ? "*/5 * * * *"
//       : frequency === "30m"
//       ? "*/30 * * * *"
//       : "0 * * * *"; // default = 1h

//   cron.schedule(cronPattern, async () => {
//     try {
//       console.log(`🔄 Running scheduled search for: ${keyword}`);
//       await axios.post("http://localhost:5000/api/search", {
//         keyword,
//         platforms,
//         ...options,
//       });
//       console.log(`✅ Completed scheduled run for '${keyword}'`);
//     } catch (err) {
//       console.error(`❌ Scheduler error for ${keyword}:`, err.message);
//     }
//   });

//   console.log(`✅ Scheduled ${frequency} search for '${keyword}'`);
// };
