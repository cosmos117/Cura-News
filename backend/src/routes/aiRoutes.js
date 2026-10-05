/**
 * AI Summarization Routes
 * Endpoints for article summarization and analysis using OpenAI
 *
 * Every endpoint here bills a real OpenAI request, so all of them require
 * authentication and are rate limited. They were previously fully anonymous
 * with no throttle, so a scripted loop could exhaust the API budget in minutes.
 */

import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { aiLimiter } from "../middleware/rateLimiter.js";
import {
  summarizeNewsArticle,
  batchSummarizeArticles,
  quickAnalyzeArticle,
  checkAIServiceHealth,
} from "../controllers/aiController.js";

const router = express.Router();

/**
 * POST /api/ai/summarize
 * Summarize a single news article. Protected + rate limited.
 *
 * Request Body:
 * {
 *   "articleText": "string (100-10000 chars)",
 *   "source": "string (optional - The Hindu, Indian Express, etc.)",
 *   "originalUrl": "string (optional - original article URL)"
 * }
 *
 * Example cURL:
 * curl -X POST http://localhost:5000/api/ai/summarize \
 *   -H "Authorization: Bearer $TOKEN" \
 *   -H "Content-Type: application/json" \
 *   -d '{"articleText":"The Union Budget 2026 was announced today..."}'
 */
router.post("/summarize", protect, aiLimiter, summarizeNewsArticle);

/**
 * POST /api/ai/batch-summarize
 * Summarize multiple articles in one request. Maximum 10 per batch.
 *
 * Request Body:
 * {
 *   "articles": ["article text 1", "article text 2", ...]
 * }
 *
 * Note: the request body key is `articles` (an array of article TEXTS), not
 * `articleIds`. The frontend previously sent the wrong key.
 */
router.post("/batch-summarize", protect, aiLimiter, batchSummarizeArticles);

/**
 * POST /api/ai/quick-analyze
 * Quick relevance analysis of an article preview (50-300 chars).
 *
 * Request Body:
 * {
 *   "articlePreview": "string (50-300 chars)"
 * }
 */
router.post("/quick-analyze", protect, aiLimiter, quickAnalyzeArticle);

/**
 * GET /api/ai/health
 * Reports whether the AI key is configured. This is a configuration check, not
 * a live probe - it does not call OpenAI.
 */
router.get("/health", checkAIServiceHealth);

export default router;