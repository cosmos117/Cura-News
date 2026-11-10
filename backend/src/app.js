import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import { config } from "./config/env.js";
import { corsMiddleware } from "./middleware/corsMiddleware.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import newsRoutes from "./routes/newsRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import bookmarkRoutes from "./routes/bookmarkRoutes.js";
import meRoutes from "./routes/meRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";

const app = express();
app.set("trust proxy", config.TRUST_PROXY);
// Plain key=value query strings only. The default parser turns ?q[$ne]=1 into
// an object, which is how query operators get smuggled into Mongo filters.
app.set("query parser", "simple");

// ====== MIDDLEWARE ======

// CORS - Handle cross-origin requests
app.use(corsMiddleware());
// A JSON API never renders HTML, so nothing may be loaded from or framed by
// its responses.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    referrerPolicy: { policy: "no-referrer" },
  }),
);
// Feed responses are repetitive JSON and shrink several times over.
app.use(compression());

// Body Parser - Parse incoming JSON requests.
// 10MB is far more than any legitimate payload (the largest is a 10,000-char
// article string) and was a cheap memory-pressure vector under load.
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ limit: "100kb", extended: true }));

// Logging - HTTP request logging
app.use(morgan(config.isDevelopment ? "dev" : "combined"));

// Rate limiting across the API surface
app.use("/api", apiLimiter);

// ====== HEALTH CHECK ======
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
  });
});

// ====== ROUTES ======

// Responses about one account must never be stored by a browser or a proxy.
app.use(["/api/auth", "/api/me", "/api/bookmarks", "/api/news/for-you"], (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Auth routes
app.use("/api/auth", authRoutes);

// News routes
app.use("/api/news", newsRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/me", meRoutes);
app.use("/api/stats", statsRoutes);

// API version and info
app.get("/api/info", (req, res) => {
  res.status(200).json({
    name: "CURA News API",
    version: "1.0.0",
    description: "AI Current Affairs News Summarizer Backend",
  });
});

// ====== ERROR HANDLING ======

// 404 Not Found Handler (must be after all routes)
app.use(notFoundHandler);

// Global Error Handler (must be last)
app.use(errorHandler);

export default app;
