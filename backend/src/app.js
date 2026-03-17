import express from "express";
import morgan from "morgan";
import { corsMiddleware } from "./middleware/corsMiddleware.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import testRoutes from "./routes/testRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import newsRoutes from "./routes/newsRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import notesRoutes from "./routes/notesRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";

const app = express();

// ====== MIDDLEWARE ======

// CORS - Handle cross-origin requests
app.use(corsMiddleware());

// Body Parser - Parse incoming JSON requests
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Logging - HTTP request logging
app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "combined"));

// ====== HEALTH CHECK ======
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
  });
});

// ====== ROUTES ======

// Test routes
app.use("/api", testRoutes);

// Auth routes
app.use("/api/auth", authRoutes);

// News routes
app.use("/api/news", newsRoutes);

// AI summarization routes
app.use("/api/ai", aiRoutes);

// Notes routes
app.use("/api/notes", notesRoutes);

// Quiz routes
app.use("/api/quiz", quizRoutes);

// API version and info
app.get("/api/info", (req, res) => {
  res.status(200).json({
    name: "CURA News API",
    version: "1.0.0",
    description: "AI Current Affairs News Summarizer Backend",
    environment: process.env.NODE_ENV || "development",
  });
});

// ====== ERROR HANDLING ======

// 404 Not Found Handler (must be after all routes)
app.use(notFoundHandler);

// Global Error Handler (must be last)
app.use(errorHandler);

export default app;
