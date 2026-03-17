/**
 * AI Summarization Controller
 * Handles requests to summarize articles using OpenAI
 */

import {
  summarizeArticle,
  summarizeArticles,
  quickAnalyze,
} from "../services/aiService.js";
import { asyncHandler } from "../middleware/errorHandler.js";

/**
 * Summarize a single article
 * POST /api/ai/summarize
 */
export const summarizeNewsArticle = asyncHandler(async (req, res) => {
  const { articleText, source, originalUrl } = req.body;

  // Validation
  if (!articleText) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Article text is required",
    });
  }

  if (typeof articleText !== "string") {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Article text must be a string",
    });
  }

  if (articleText.length < 100) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Article must be at least 100 characters long",
    });
  }

  if (articleText.length > 10000) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Article must be less than 10,000 characters",
    });
  }

  try {
    // Summarize article
    const result = await summarizeArticle(articleText);

    // Add source and URL if provided
    if (source) {
      result.source = source;
    }
    if (originalUrl) {
      result.url = originalUrl;
    }

    res.status(200).json({
      success: true,
      message: "Article summarized successfully",
      statusCode: 200,
      data: result,
    });
  } catch (error) {
    // Handle specific error types
    if (error.isNotRelevant) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: error.message,
      });
    }

    if (error.message.includes("authentication failed")) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: "AI service authentication failed - check OPENAI_API_KEY",
        error: error.message,
      });
    }

    if (error.message.includes("rate limited")) {
      return res.status(429).json({
        success: false,
        statusCode: 429,
        message: "AI service rate limited - please try again later",
      });
    }

    console.error("Article summarization error:", error);

    res.status(500).json({
      success: false,
      statusCode: 500,
      message: error.message || "Failed to summarize article",
    });
  }
});

/**
 * Batch summarize multiple articles
 * POST /api/ai/batch-summarize
 */
export const batchSummarizeArticles = asyncHandler(async (req, res) => {
  const { articles } = req.body;

  // Validation
  if (!articles) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Articles array is required",
    });
  }

  if (!Array.isArray(articles)) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Articles must be an array",
    });
  }

  if (articles.length === 0) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "At least one article is required",
    });
  }

  if (articles.length > 10) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Maximum 10 articles per batch",
    });
  }

  try {
    // Validate all articles are strings
    for (let i = 0; i < articles.length; i++) {
      if (typeof articles[i] !== "string") {
        return res.status(400).json({
          success: false,
          statusCode: 400,
          message: `Article ${i + 1} must be a string`,
        });
      }
      if (articles[i].length < 100) {
        return res.status(400).json({
          success: false,
          statusCode: 400,
          message: `Article ${i + 1} must be at least 100 characters`,
        });
      }
    }

    // Summarize articles
    const result = await summarizeArticles(articles);

    res.status(200).json({
      success: true,
      message: `Processed ${articles.length} articles (${result.successful} successful, ${result.failed} failed)`,
      statusCode: 200,
      data: result,
    });
  } catch (error) {
    console.error("Batch summarization error:", error);

    res.status(500).json({
      success: false,
      statusCode: 500,
      message: error.message || "Failed to process batch",
    });
  }
});

/**
 * Quick analyze article relevance
 * POST /api/ai/quick-analyze
 * Useful for checking if content is UPSC/CDS relevant before full processing
 */
export const quickAnalyzeArticle = asyncHandler(async (req, res) => {
  const { articlePreview } = req.body;

  // Validation
  if (!articlePreview) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Article preview is required",
    });
  }

  if (typeof articlePreview !== "string") {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Article preview must be a string",
    });
  }

  if (articlePreview.length < 50) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Article preview must be at least 50 characters",
    });
  }

  try {
    const result = await quickAnalyze(articlePreview);

    res.status(200).json({
      success: true,
      message: "Article analyzed",
      statusCode: 200,
      data: result,
    });
  } catch (error) {
    console.error("Quick analysis error:", error);

    if (error.message.includes("authentication failed")) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: "AI service authentication failed",
      });
    }

    res.status(500).json({
      success: false,
      statusCode: 500,
      message: error.message || "Failed to analyze article",
    });
  }
});

/**
 * Health check for AI service
 * GET /api/ai/health
 */
export const checkAIServiceHealth = asyncHandler(async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;

  res.status(200).json({
    success: true,
    statusCode: 200,
    data: {
      status: "AI service available",
      apiKeyConfigured: !!apiKey,
      service: "OpenAI GPT-4 Turbo",
      capabilities: [
        "Article summarization",
        "UPSC/CDS relevance filtering",
        "Exam-oriented MCQ generation",
        "Batch processing",
      ],
    },
  });
});

export default {
  summarizeNewsArticle,
  batchSummarizeArticles,
  quickAnalyzeArticle,
  checkAIServiceHealth,
};
