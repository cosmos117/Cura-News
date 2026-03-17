import express from "express";
import { protect, optionalAuth } from "../middleware/authMiddleware.js";
import {
  submitQuiz,
  getQuizForArticle,
  getQuizAnswers,
  getQuizStats,
  analyzeQuiz,
} from "../controllers/quizController.js";

const router = express.Router();

/**
 * Quiz Routes
 * /api/quiz/*
 */

/**
 * POST /api/quiz/submit
 * Submit quiz answers for an article
 * Optional auth: Works with or without authentication
 *
 * Request Body:
 * {
 *   "articleId": "MongoDB ObjectId",
 *   "answers": ["A", "B", "C", "A"] // User selected options
 * }
 *
 * Validation:
 * - articleId: Must be valid MongoDB ObjectId
 * - answers: Must be array of A/B/C/D values
 * - answers.length: Must match quiz questions count
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Quiz submitted successfully",
 *   "data": {
 *     "articleId": "...",
 *     "headline": "...",
 *     "score": 3,              // Number of correct answers
 *     "total": 4,              // Total questions
 *     "percentage": 75,        // Score as percentage
 *     "resultLevel": "Good",   // Excellent|Good|Average|Poor
 *     "submittedAt": "ISO timestamp",
 *     "questions": [
 *       {
 *         "questionNumber": 1,
 *         "question": "What is the capital of India?",
 *         "options": ["Mumbai", "Delhi", "Bangalore", "Kolkata"],
 *         "userAnswer": "B",
 *         "correctAnswer": "B",
 *         "isCorrect": true
 *       },
 *       ...
 *     ]
 *   }
 * }
 *
 * Example cURL:
 * curl -X POST http://localhost:5000/api/quiz/submit \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "articleId": "507f1f77bcf86cd799439011",
 *     "answers": ["A", "B", "C", "A"]
 *   }'
 *
 * Scoring:
 * - 80-100%: Excellent
 * - 60-79%:  Good
 * - 40-59%:  Average
 * - 0-39%:   Poor
 */
router.post("/submit", optionalAuth, submitQuiz);

/**
 * GET /api/quiz/:articleId
 * Get quiz for an article (without answers)
 * Public: No authentication required
 * Used to display quiz questions to students
 *
 * Parameters:
 * - articleId: MongoDB ObjectId of article
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Quiz retrieved successfully",
 *   "data": {
 *     "articleId": "...",
 *     "headline": "...",
 *     "date": "ISO timestamp",
 *     "totalQuestions": 4,
 *     "questions": [
 *       {
 *         "questionNumber": 1,
 *         "question": "What is the capital of India?",
 *         "options": ["Mumbai", "Delhi", "Bangalore", "Kolkata"]
 *         // Note: Answer NOT included
 *       },
 *       ...
 *     ]
 *   }
 * }
 *
 * Example cURL:
 * curl http://localhost:5000/api/quiz/507f1f77bcf86cd799439011
 */
router.get("/:articleId", getQuizForArticle);

/**
 * GET /api/quiz/:articleId/answers
 * Get quiz with correct answers (for review)
 * Protected: Future auth - will require teacher/admin role
 * Used for grading and reviewing quizzes
 *
 * Parameters:
 * - articleId: MongoDB ObjectId of article
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Quiz answers retrieved successfully",
 *   "data": {
 *     "articleId": "...",
 *     "headline": "...",
 *     "date": "ISO timestamp",
 *     "totalQuestions": 4,
 *     "questions": [
 *       {
 *         "questionNumber": 1,
 *         "question": "What is the capital of India?",
 *         "options": ["Mumbai", "Delhi", "Bangalore", "Kolkata"],
 *         "correctAnswer": "B"  // Answer included
 *       },
 *       ...
 *     ]
 *   }
 * }
 *
 * Example cURL:
 * curl http://localhost:5000/api/quiz/507f1f77bcf86cd799439011/answers
 */
router.get("/:articleId/answers", getQuizAnswers);

/**
 * GET /api/quiz/stats/:articleId
 * Get quiz statistics for an article
 * Public: No authentication required
 * Shows aggregate information about quiz performance
 *
 * Parameters:
 * - articleId: MongoDB ObjectId of article
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Quiz statistics retrieved successfully",
 *   "data": {
 *     "articleId": "...",
 *     "headline": "...",
 *     "totalQuestions": 4,
 *     "totalAttempts": 150,
 *     "averageScore": 72,
 *     "passRate": 85,
 *     // Future fields available when submission tracking implemented
 *   }
 * }
 *
 * Example cURL:
 * curl http://localhost:5000/api/quiz/stats/507f1f77bcf86cd799439011
 */
router.get("/stats/:articleId", getQuizStats);

/**
 * POST /api/quiz/analysis/:articleId
 * Analyze quiz difficulty and structure
 * Internal: For future ML-based difficulty assessment
 *
 * Parameters:
 * - articleId: MongoDB ObjectId of article
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Quiz analysis completed",
 *   "data": {
 *     "articleId": "...",
 *     "headline": "...",
 *     "totalQuestions": 4,
 *     "analysis": {
 *       "avgQuestionLength": 85,
 *       "optionsFormat": "Always 4 options (A, B, C, D)",
 *       "estimatedDifficulty": "Medium",
 *       "suggestedTime": "10-15 minutes"
 *     }
 *   }
 * }
 *
 * Example cURL:
 * curl -X POST http://localhost:5000/api/quiz/analysis/507f1f77bcf86cd799439011
 */
router.post("/analysis/:articleId", analyzeQuiz);

export default router;
