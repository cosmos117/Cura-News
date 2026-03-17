import express from "express";
import {
  getTodayNews,
  getNewsByID,
  createNews,
  getNewsByTag,
  getNewsBySource,
  searchNews,
  getNewsStats,
  fetchDailyNews,
} from "../controllers/newsController.js";

const router = express.Router();

/**
 * News Routes
 * /api/news/*
 */

/**
 * GET /api/news/today
 * Fetch today's news with optional tag filtering
 *
 * Query Parameters:
 * - tag: Filter by single tag (Polity, Economy, Defense, Science, International)
 * - tags: Filter by multiple tags (comma-separated, e.g., "Polity,Economy")
 * - source: Filter by source (The Hindu, Indian Express, Times of India)
 * - limit: Number of results (default: 10, max: 50)
 * - skip: Pagination offset (default: 0)
 *
 * Example:
 * GET /api/news/today?tag=Polity
 * GET /api/news/today?tags=Polity,Economy&limit=15
 * GET /api/news/today?source=The Hindu
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Found 10 news articles for today",
 *   "pagination": {
 *     "total": 25,
 *     "limit": 10,
 *     "skip": 0,
 *     "hasMore": true
 *   },
 *   "data": [
 *     {
 *       "_id": "...",
 *       "source": "The Hindu",
 *       "date": "2026-03-17T...",
 *       "headline": "...",
 *       "summary": "...",
 *       "bulletPoints": [...],
 *       "tags": ["Polity"],
 *       "quiz": [
 *         {
 *           "question": "...",
 *           "options": ["A", "B", "C", "D"]
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
router.get("/today", getTodayNews);

/**
 * GET /api/news
 * Fetch all today's news (alias for /today with optional tag filtering)
 * Same behavior as /today endpoint for convenience
 */
router.get("/", getTodayNews);

/**
 * GET /api/news/:id
 * Fetch a single news article by ID
 *
 * Parameters:
 * - id: MongoDB ObjectId of the article
 *
 * Query Parameters:
 * - includeAnswers: "true" to include quiz answers (for admin/teacher)
 *
 * Example:
 * GET /api/news/507f1f77bcf86cd799439011
 * GET /api/news/507f1f77bcf86cd799439011?includeAnswers=true
 *
 * Response (Public):
 * {
 *   "success": true,
 *   "message": "News article retrieved successfully",
 *   "data": {
 *     "_id": "...",
 *     "source": "The Hindu",
 *     "headline": "...",
 *     "summary": "...",
 *     "bulletPoints": [...],
 *     "tags": [...],
 *     "subtopics": [...],
 *     "quiz": [
 *       {
 *         "question": "...",
 *         "options": [...],
 *         "answer": "A"  // Only if includeAnswers=true
 *       }
 *     ]
 *   }
 * }
 */
router.get("/:id", getNewsByID);

/**
 * POST /api/news
 * Create a new news article (with AI-processed data)
 *
 * Request Body:
 * {
 *   "source": "The Hindu",
 *   "headline": "Budget 2026: Key Highlights",
 *   "summary": "The government announced the budget with focus on infrastructure and education.",
 *   "bulletPoints": [
 *     "10% increase in education spending",
 *     "New infrastructure projects worth $100B",
 *     "Tax benefits for startups"
 *   ],
 *   "tags": ["Economy", "Polity"],
 *   "subtopics": ["Fiscal Policy", "Government Spending"],
 *   "quiz": [
 *     {
 *       "question": "What is the focus of the new budget?",
 *       "options": ["Education", "Defense", "Infrastructure", "All of the above"],
 *       "answer": "D"
 *     }
 *   ],
 *   "url": "https://thehindu.com/article",
 *   "date": "2026-03-17"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "News article created successfully",
 *   "data": {
 *     "id": "507f1f77bcf86cd799439011",
 *     "source": "The Hindu",
 *     "headline": "Budget 2026: Key Highlights",
 *     "tags": ["Economy", "Polity"],
 *     "date": "2026-03-17T..."
 *   }
 * }
 */
router.post("/", createNews);

/**
 * GET /api/news/tag/:tagName
 * Get all news articles with a specific tag
 *
 * Parameters:
 * - tagName: One of (Polity, Economy, Defense, Science, International)
 *
 * Query Parameters:
 * - limit: Number of results (default: 10, max: 50)
 * - skip: Pagination offset (default: 0)
 *
 * Example:
 * GET /api/news/tag/Polity
 * GET /api/news/tag/Economy?limit=20&skip=10
 *
 * Response: Similar to /today endpoint
 */
router.get("/tag/:tagName", getNewsByTag);

/**
 * GET /api/news/source/:sourceName
 * Get all news articles from a specific source
 *
 * Parameters:
 * - sourceName: One of (The Hindu, Indian Express, Times of India)
 *
 * Query Parameters:
 * - limit: Number of results (default: 10, max: 50)
 * - skip: Pagination offset (default: 0)
 *
 * Example:
 * GET /api/news/source/The Hindu
 * GET /api/news/source/Indian Express?limit=15
 *
 * Response: Similar to /today endpoint
 */
router.get("/source/:sourceName", getNewsBySource);

/**
 * GET /api/news/search
 * Search news by headline or summary
 *
 * Query Parameters:
 * - q: Search query (required, min 3 characters)
 * - limit: Number of results (default: 10, max: 50)
 *
 * Example:
 * GET /api/news/search?q=budget 2026
 * GET /api/news/search?q=climate change&limit=5
 *
 * Response: Similar to /today endpoint
 */
router.get("/search", searchNews);

/**
 * GET /api/news/stats/overview
 * Get statistics about news articles
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "totalArticles": 150,
 *     "todayArticles": 25,
 *     "bySource": {
 *       "The Hindu": 50,
 *       "Indian Express": 45,
 *       "Times of India": 55
 *     },
 *     "byTag": {
 *       "Polity": 40,
 *       "Economy": 35,
 *       "Defense": 30,
 *       "Science": 25,
 *       "International": 20
 *     }
 *   }
 * }
 */
router.get("/stats/overview", getNewsStats);

/**
 * GET /api/news/fetch-daily
 * Fetch and process daily news from NewsAPI
 * Triggers complete pipeline in background:
 * 1. Fetch from NewsAPI with UPSC keywords
 * 2. Deduplicate against existing articles
 * 3. Filter by relevance (AI or keyword-based)
 * 4. Summarize with OpenAI
 * 5. Store in MongoDB
 *
 * Query Parameters:
 * - skipAIFilter: "true" to use keyword filter only (faster, less accurate)
 *
 * Response (202 Accepted - Pipeline runs in background):
 * {
 *   "success": true,
 *   "message": "📡 Daily news pipeline started. Processing in background...",
 *   "statusCode": 202,
 *   "info": "Check /api/news/today after a few seconds to see new articles",
 *   "estimatedTime": "30-60 seconds depending on API availability"
 * }
 *
 * Example:
 * GET /api/news/fetch-daily
 * GET /api/news/fetch-daily?skipAIFilter=true
 *
 * Implementation Flow:
 * Request → Background Job Started → 202 Response Sent
 *   Background Job:
 *   1. Fetch articles (5 keywords, 5 articles each = ~25 articles)
 *   2. Deduplicate (check existing URLs)
 *   3. AI Filter (analyze relevance for each)
 *   4. Summarize (call OpenAI for each relevant article)
 *   5. Store (bulk insert to MongoDB)
 *   6. Log results
 */
router.get("/fetch-daily", fetchDailyNews);

export default router;
