import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { app } from "./app.js";
import { connectToDB } from "./config/db.js";
import { scheduleAllGroups } from "./utils/cronManager.js";
import { pythonServiceManager } from "./services/pythonServiceManager.js";
//import { startKeywordGroupScheduler } from "./controllers/cronscheduler.js";

// Ensure we always load the .env that lives in the backend folder,
// regardless of where `node` is executed from.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, ".env");
const envResult = dotenv.config({ path: envPath });

// Diagnostic: Check if .env file was found
if (envResult.error) {
  console.warn(`⚠️  Warning: Could not load .env file from ${envPath}`);
  console.warn(`   Error: ${envResult.error.message}`);
} else {
  console.log(`✅ Loaded .env file from: ${envPath}`);
}

// Check Python sentiment service configuration
const sentimentServiceUrl = process.env.SENTIMENT_SERVICE_URL || "http://localhost:8000";
console.log(`🤖 Sentiment Service URL: ${sentimentServiceUrl}`);

const PORT = process.env.PORT || 5000;

// Connect to database and start server
async function startServer() {
  try {
    // Start Python sentiment service first
    console.log('🚀 Starting services...');

    try {
      await pythonServiceManager.start();
      console.log('✅ Python sentiment service is ready');
    } catch (error) {
      console.warn('⚠️  Python sentiment service failed to start:', error.message);
      console.warn('   Sentiment analysis will not be available');
      console.warn('   Server will continue without sentiment features');
    }

    // Connect to database
    await connectToDB();

    // Schedule cron jobs
    await scheduleAllGroups();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('');
      console.log('✨ All services started successfully!');
    });

    // startKeywordGroupScheduler().catch((err) => {
    //   console.error("⚠️ Failed to start keyword group scheduler:", err);
    // });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    pythonServiceManager.stop();
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  pythonServiceManager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  pythonServiceManager.stop();
  process.exit(0);
});

startServer();

