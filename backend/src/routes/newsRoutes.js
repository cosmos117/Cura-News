import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { detailedLimiter, pipelineLimiter } from "../middleware/rateLimiter.js";
import {
  getTodayNews,
  getNewsByID,
  createNews,
  getNewsByTag,
  getNewsBySource,
  searchNews,
  getNewsStats,
  fetchDailyNews,
  generateDetailedNews,
} from "../controllers/newsController.js";

const router = express.Router();

/**
 * News Routes
 * /api/news/*
 *
 * ROUTE ORDER MATTERS: every single-segment path below (/search,
 * /fetch-daily, /stats) must be registered BEFORE the /:id catch-all, or
 * Express will match them as an :id and return 404. Previously `/search` and
 * `/fetch-daily` were both shadowed by `/:id` and therefore unreachable.
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
 * Quiz answers are always stripped from list responses.
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

/**
 * GET /api/news/fetch-daily
 * Trigger the fetch -> filter -> summarize -> store pipeline.
 *
 * Protected + rate limited: each run issues ~20 NewsAPI requests and up to
 * ~115 billed OpenAI requests. The processor also holds an in-flight lock so
 * concurrent invocations cannot overlap.
 *
 * Query Parameters:
 * - skipAIFilter: "true" to use the keyword filter instead of per-article
 *   AI relevance analysis (cheaper, less precise).
 */
router.get("/fetch-daily", protect, pipelineLimiter, fetchDailyNews);

router.post("/:id/detailed", protect, detailedLimiter, generateDetailedNews);

/**
 * POST /api/news
 * Create a new news article.
 *
 * Protected: previously unauthenticated, which allowed anyone to inject
 * arbitrary articles - including fabricated quiz answer keys - straight into
 * the published feed.
 *
 * Request Body:
 * {
 *   "source": "The Hindu",
 *   "headline": "Budget 2026: Key Highlights",
 *   "summary": "The government announced the budget with focus on infrastructure.",
 *   "bulletPoints": ["10% increase in education spending", "..."],
 *   "tags": ["Economy", "Polity"],
 *   "subtopics": ["Fiscal Policy"],
 *   "quiz": [
 *     {
 *       "question": "What is the focus of the new budget?",
 *       "options": ["Education", "Defense", "Infrastructure", "All of the above"],
 *       "answer": "D"
 *     }
 *   ]
 * }
 */
router.post("/", protect, createNews);

/**
 * GET /api/news/:id
 * Fetch a single news article by ID
 *
 * Query Parameters:
 * - includeAnswers: NO LONGER SUPPORTED. This flag previously exposed every
 *   correct quiz answer to anonymous callers. Use POST /api/quiz/submit,
 *   which returns per-question feedback after an attempt, instead.
 *
 * Response: { success, message, data: { _id, source, date, headline, summary,
 *   bulletPoints, tags, subtopics, quiz (answers stripped) } }
 */
router.get("/:id", getNewsByID);

export default router;