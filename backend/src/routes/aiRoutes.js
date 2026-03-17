/**
 * AI Summarization Routes
 * Endpoints for article summarization and analysis using OpenAI
 */

import express from "express";
import {
  summarizeNewsArticle,
  batchSummarizeArticles,
  quickAnalyzeArticle,
  checkAIServiceHealth,
} from "../controllers/aiController.js";

const router = express.Router();

/**
 * POST /api/ai/summarize
 * Summarize a single news article
 *
 * Request Body:
 * {
 *   "articleText": "string (100-10000 chars)",
 *   "source": "string (optional - The Hindu, Indian Express, etc.)",
 *   "originalUrl": "string (optional - original article URL)"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "headline": "string",
 *     "summary": "string (3 lines)",
 *     "bulletPoints": ["string"],
 *     "tags": ["Polity/Economy/Defense/Science/International"],
 *     "subtopics": ["string"],
 *     "quiz": [{"question": "...", "options": [...], "answer": "A-D"}],
 *     "source": "string",
 *     "url": "string",
 *     "processedAt": "ISO timestamp"
 *   }
 * }
 *
 * Example cURL:
 * curl -X POST http://localhost:5000/api/ai/summarize \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "articleText": "The Union Budget 2026 was announced today with focus on infrastructure. The government allocated $100 billion for new projects...",
 *     "source": "The Hindu",
 *     "originalUrl": "https://thehindu.com/..."
 *   }'
 */
router.post("/summarize", summarizeNewsArticle);

/**
 * POST /api/ai/batch-summarize
 * Summarize multiple articles in one request
 * Maximum 10 articles per batch
 *
 * Request Body:
 * {
 *   "articles": ["article text 1", "article text 2", ...]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "total": 3,
 *     "successful": 3,
 *     "failed": 0,
 *     "results": [
 *       {
 *         "index": 0,
 *         "success": true,
 *         "data": {...}
 *       }
 *     ],
 *     "errors": []
 *   }
 * }
 *
 * Example cURL:
 * curl -X POST http://localhost:5000/api/ai/batch-summarize \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "articles": [
 *       "First article text here...",
 *       "Second article text here...",
 *       "Third article text here..."
 *     ]
 *   }'
 */
router.post("/batch-summarize", batchSummarizeArticles);

/**
 * POST /api/ai/quick-analyze
 * Quick analysis of article relevance (does NOT perform full summarization)
 * Use this to quickly determine if an article is relevant before full processing
 *
 * Request Body:
 * {
 *   "articlePreview": "string (50-300 chars - first paragraph of article)"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "isRelevant": boolean,
 *     "primaryTopic": "Polity|Economy|Defense|Science|International|Other",
 *     "confidence": 0-100,
 *     "reason": "string"
 *   }
 * }
 *
 * Example cURL:
 * curl -X POST http://localhost:5000/api/ai/quick-analyze \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "articlePreview": "The Ministry of Defense announced new defense procurement policies today. The announcement focuses on modernization and indigenous equipment development."
 *   }'
 *
 * Use Cases:
 * - Pre-filter articles before full processing
 * - Categorize content quickly
 * - Build relevance scoring system
 */
router.post("/quick-analyze", quickAnalyzeArticle);

/**
 * GET /api/ai/health
 * Check AI service health and capabilities
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "status": "AI service available",
 *     "apiKeyConfigured": true,
 *     "service": "OpenAI GPT-4 Turbo",
 *     "capabilities": [...]
 *   }
 * }
 *
 * Example cURL:
 * curl http://localhost:5000/api/ai/health
 */
router.get("/health", checkAIServiceHealth);

export default router;
