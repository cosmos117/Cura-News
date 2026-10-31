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

// ====== MIDDLEWARE ======

// CORS - Handle cross-origin requests
app.use(corsMiddleware());
app.use(helmet());
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
    environment: config.NODE_ENV,
  });
});

// ====== ERROR HANDLING ======

// 404 Not Found Handler (must be after all routes)
app.use(notFoundHandler);

// Global Error Handler (must be last)
app.use(errorHandler);

export default app;
