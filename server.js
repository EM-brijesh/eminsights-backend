import dotenv from "dotenv";
import { app } from "./app.js";
import { connectToDB } from "./config/db.js";
//import { startKeywordGroupScheduler } from "./controllers/cronscheduler.js";

// Load environment variables BEFORE anything else consumes them
dotenv.config();

const PORT = process.env.PORT || 5000;

// Connect to database and start server
async function startServer() {
  try {
    await connectToDB();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    // startKeywordGroupScheduler().catch((err) => {
    //   console.error("⚠️ Failed to start keyword group scheduler:", err);
    // });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();
