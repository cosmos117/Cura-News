import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { detailedLimiter } from "../middleware/rateLimiter.js";
import {
  getTodayNews,
  getNewsByID,
  createNews,
  getNewsByTag,
  getNewsBySource,
  searchNews,
  getNewsStats,
  generateDetailedNews,
} from "../controllers/newsController.js";

const router = express.Router();

/**
 * News Routes
 * /api/news/*
 *
 * ROUTE ORDER MATTERS: every single-segment path below (/search, /stats) must
 * be registered BEFORE the /:id catch-all.
 */

/**
 * GET /api/news/today  (alias: GET /api/news)
 * Fetch today's news with optional filtering
 *
 * Query Parameters:
 * - tag: Filter by single tag (Polity, Economy, Defense, Science, International)
 * - tags: Filter by multiple tags (comma-separated, e.g. "Polity,Economy")
 * - source: Filter by source (The Hindu, Indian Express, Times of India)
 * - limit: Number of results (default: 10, max: 100)
 * - skip: Pagination offset (default: 0)
 *
 * Response: { success, message, pagination: {total,limit,skip,hasMore}, data: [...] }
 */
router.get("/today", getTodayNews);
router.get("/", getTodayNews);

/**
 * GET /api/news/search?q=...
 * Full-text search across headlines and summaries
 *
 * Query Parameters:
 * - q: Search term (required)
 * - limit: Number of results (default: 10, max: 50)
 * - skip: Pagination offset (default: 0)
 */
router.get("/search", searchNews);

/**
 * GET /api/news/stats/overview
 * Aggregate counts by source and by tag
 */
router.get("/stats/overview", getNewsStats);

/**
 * GET /api/news/tag/:tagName
 * Articles for a single tag
 */
router.get("/tag/:tagName", getNewsByTag);

/**
 * GET /api/news/source/:sourceName
 * Articles from a single source
 */
router.get("/source/:sourceName", getNewsBySource);

router.all("/fetch-daily", (req, res) => {
  res.status(404).json({
    success: false,
    message: "This endpoint was replaced by POST /api/admin/ingest",
  });
});

router.post(
  "/:id/detailed",
  protect,
  detailedLimiter,
  generateDetailedNews,
  (error, req, res, next) => {
    if (error.statusCode || res.headersSent) return next(error);

    console.error("Unhandled detailed summary route error:", {
      articleId: req.params.id,
      message: error.message,
      stack: error.stack,
    });
    return res.status(503).json({
      success: false,
      message:
        "Detailed summary could not be generated right now. Please try again.",
    });
  },
);

/**
 * POST /api/news
 * Create a new news article.
 *
 * Protected: previously unauthenticated, which allowed anyone to inject
 * arbitrary articles straight into the published feed.
 *
 * Request Body:
 * {
 *   "source": "The Hindu",
 *   "headline": "Budget 2026: Key Highlights",
 *   "summary": "The government announced the budget with focus on infrastructure.",
 *   "bulletPoints": ["10% increase in education spending", "..."],
 *   "tags": ["Economy", "Polity"],
 *   "subtopics": ["Fiscal Policy"]
 * }
 */
router.post("/", protect, createNews);

/**
 * GET /api/news/:id
 * Fetch a single news article by ID
 *
 * Response: { success, message, data: { _id, source, date, headline, summary,
 *   bulletPoints, tags, subtopics } }
 */
router.get("/:id", getNewsByID);

export default router;