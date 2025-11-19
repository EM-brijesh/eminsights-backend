import dotenv from "dotenv";
dotenv.config();

console.log("🔍 Testing Backend Configuration...\n");

// Test 1: Check environment variables
console.log("1️⃣ Environment Variables:");
console.log("   PORT:", process.env.PORT || "5000 (default)");
console.log("   MONGODB_URI:", process.env.MONGODB_URI ? "✅ Found" : "❌ Missing");
console.log("   YT_API_KEY:", process.env.YT_API_KEY ? "✅ Found" : "❌ Missing");
console.log("");

// Test 2: Test MongoDB connection
console.log("2️⃣ Testing MongoDB Connection...");
try {
  const { connectToDB } = await import("./config/db.js");
  await connectToDB();
  console.log("   ✅ MongoDB connection successful!\n");
} catch (error) {
  console.error("   ❌ MongoDB connection failed:", error.message);
  console.error("   Error:", error);
  process.exit(1);
}

// Test 3: Test Express app
console.log("3️⃣ Testing Express App...");
try {
  const { app } = await import("./app.js");
  console.log("   ✅ Express app loaded successfully!\n");
  
  // Start server
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log("4️⃣ Server Status:");
    console.log(`   ✅ Server running on http://localhost:${PORT}`);
    console.log(`   ✅ Health check: http://localhost:${PORT}/health`);
    console.log("\n🎉 Backend is working correctly!");
  });
} catch (error) {
  console.error("   ❌ Express app failed:", error.message);
  console.error("   Error:", error);
  process.exit(1);
}





