import express from "express";
import cors from "cors";

// Import routes
import searchRoutes from "./routes/search.route.js";
import brandRoutes from "./routes/brand.route.js";
import authRoutes from "./routes/auth.route.js";
import dataRoutes from "./routes/data.routes.js";
import usersRoutes from "./routes/users.route.js";
import sentimentRoutes from "./routes/sentiment.route.js";
import { protect } from "./middleware/auth.js";

const app = express();

// ---------------------------------------------
// 🌐 CORS Configuration
// ---------------------------------------------
const allowedOriginList = process.env.ALLOWED_ORIGINS
? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
: [
    "http://localhost:3000",
    "http://eminsights.in",
    "https://eminsights.in"
  ];

const corsOptions = {
origin(origin, callback) {
  if (!origin) return callback(null, true);

  if (allowedOriginList.includes(origin)) {
    return callback(null, true);
  }

  console.warn(`🚫 CORS blocked origin: ${origin}`);
  return callback(new Error(`Origin ${origin} not allowed by CORS`));
},
credentials: true,
methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// ---------------------------------------------
// 🧰 Middleware
// ---------------------------------------------
// Parse JSON and URL-encoded bodies with configurable size limits
const BODY_PARSER_LIMIT = process.env.BODY_PARSER_LIMIT || "10mb";
app.use(express.json({ limit: BODY_PARSER_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_PARSER_LIMIT }));

// ---------------------------------------------
// 🛣️ Routes
// ---------------------------------------------
app.use("/api/search", searchRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/data", protect, dataRoutes);
app.use("/api/sentiment", protect, sentimentRoutes);

// Health check route
app.get("/health", (req, res) => {
  res.json({ success: true, message: "✅ Server is running" });
});

// ---------------------------------------------
// ⚠️ Error handler for oversized payloads & others
// ---------------------------------------------
app.use((err, req, res, next) => {
  const isPayloadTooLarge =
    (err.type && err.type === "entity.too.large") ||
    err.status === 413 ||
    err.statusCode === 413 ||
    (err.message && /request entity too large/i.test(err.message));

  if (isPayloadTooLarge) {
    return res.status(413).json({
      success: false,
      message:
        "Payload too large. Increase BODY_PARSER_LIMIT or send smaller requests (use multipart uploads for files).",
    });
  }

  next(err); // Delegate to default Express error handler if not handled here
});

export { app };
