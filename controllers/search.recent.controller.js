import { fetchYouTubeSearch } from "../services/youtube.service.js";
import { fetchTwitterSearch } from "../services/twitter.service.js";
import { fetchRedditSearch } from "../services/reddit.service.js";
import { fetchGoogleSearch } from "../services/google.service.js";



// export const searchRecent = async (req, res) => {
//   try {
//     const {
//       keyword,
//       platforms = ["twitter", "youtube", "reddit"],
//       include = [],
//       exclude = [],
//       language = "en",
//       country = "IN",
//       frequency = "30m"
//     } = req.body;

//     if (!keyword) {
//       return res.status(400).json({ success: false, message: "Keyword is required" });
//     }

//     // Time window — last 1 hour, ensuring safe end_time
//     const now = new Date();
//     const searchStart = new Date(now.getTime() - 60 * 60 * 1000);
//     const searchEnd = new Date(now.getTime() - 10 * 1000); // 10s buffer for Twitter

//     const results = {};
//     const promises = [];

//     if (platforms.includes("twitter")) {
//       promises.push(
//         fetchTwitterSearch(keyword, {
//           includeKeywords: include,
//           excludeKeywords: exclude,
//           language,
//           country,
//           startDate: searchStart,
//           endDate: searchEnd
//         }).then((data) => (results.twitter = data))
//       );
//     }

//     if (platforms.includes("youtube")) {
//       promises.push(
//         fetchYouTubeSearch(keyword, {
//           includeKeywords: include,
//           excludeKeywords: exclude,
//           language,
//           country,
//           startDate: searchStart,
//           endDate: searchEnd
//         }).then((data) => (results.youtube = data))
//       );
//     }

//     if (platforms.includes("reddit")) {
//       promises.push(
//         fetchRedditSearch(keyword, {
//           includeKeywords: include,
//           excludeKeywords: exclude,
//           startDate: searchStart,
//           endDate: searchEnd
//         }).then((data) => (results.reddit = data))
//       );
//     }
//     if (platforms.includes("google")) {
//       promises.push(
//         fetchGoogleSearch(keyword, {
//           includeKeywords: include,
//           excludeKeywords: exclude
//         }).then((data) => {
//           console.log("🟢 Google final mapped results:", data);   // <-- ADD HERE
//           results.google = data;
//         })
//       );
//     }

//     await Promise.all(promises);

//     res.json({
//       success: true,
//       mode: "recent",
//       keyword,
//       platforms,
//       frequency,
//       results
//     });
//   } catch (error) {
//     console.error("Recent Search Error:", error);
//     res.status(500).json({ success: false, message: error.message });
//   }
// };


