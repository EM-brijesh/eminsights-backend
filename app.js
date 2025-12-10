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
import cookieParser from "cookie-parser";

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
app.use(express.json());
app.use(cookieParser());

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
// META ROUTES 
app.get('/auth/meta/login', (req, res) => {
  const fbLoginUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${process.env.META_REDIRECT_URI}&scope=pages_show_list,pages_read_engagement,instagram_basic`;
  res.redirect(fbLoginUrl);
});

app.get('/auth/meta/callback', async (req, res) => {
  const { code } = req.query;

  const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${process.env.META_APP_ID}&redirect_uri=${process.env.META_REDIRECT_URI}&client_secret=${process.env.META_APP_SECRET}&code=${code}`;

  const response = await fetch(tokenUrl);
  const data = await response.json();

  console.log("Meta returned token:", data);

  if (data.error) {
    console.error("OAuth Error:", data.error);
    return res.status(400).send("Meta OAuth failed: " + data.error.message);
  }

  res.cookie("fb_user_token", data.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  });

  res.redirect("http://localhost:3000/settings/channel-config");
});




app.get("/api/pages", async (req, res) => {
  console.log("Cookies received:", req.cookies);

  const token = req.cookies.fb_user_token;
  if (!token) return res.status(401).json({ error: "No token. Login first." });

  const url = `https://graph.facebook.com/v21.0/me/accounts?access_token=${token}`;
  const resp = await fetch(url);
  const data = await resp.json();

  return res.json(data);
});

app.get("/api/ig-account", async (req, res) => {
  const { pageId, pageToken } = req.query;

  if (!pageId || !pageToken) {
    return res.status(400).json({ error: "Missing pageId or pageToken" });
  }

  const url = `https://graph.facebook.com/v21.0/${pageId}?fields=connected_instagram_account&access_token=${pageToken}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch IG account" });
  }
});


app.get('/api/mock-hashtag-search', (req, res) => {
  const mock = {
    hashtag: req.query.hashtag,
    results: [
      {
        id: "1",
        media_url: "https://via.placeholder.com/300",
        caption: "Mock fitness post 💪",
        username: "fit_user_1"
      },
      {
        id: "2",
        media_url: "https://via.placeholder.com/300",
        caption: "Another workout mock!",
        username: "gymlover"
      }
    ]
  };
  res.json(mock);
});

app.get('/api/mock-insights', (req, res) => {
  res.json({
    likes: 1240,
    comments: 89,
    saves: 52,
    reach: 14500,
    engagement_rate: 6.4
  });
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
