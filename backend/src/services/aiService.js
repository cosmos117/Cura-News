/**
 * AI Summarization Service
 * Converts raw news articles into structured, UPSC/CDS-relevant content
 * Uses OpenAI API with structured JSON output
 */

import axios from "axios";
import { config } from "../config/env.js";

const env = config;

/**
 * System prompt - Instructs OpenAI to focus on UPSC/CDS relevant content
 */
const SYSTEM_PROMPT = `You are an expert news analyst specializing in Indian Civil Services (CDS/UPSC) exam preparation. 

Your task is to process news articles and extract UPSC-relevant information while:
1. Filtering out entertainment, gossip, and irrelevant content
2. Focusing on Polity, Economy, Defense, Science, and International relations
3. Creating concise, factual summaries suitable for exam preparation
4. Generating exam-oriented multiple-choice questions
5. Identifying key topics and subtopics

IMPORTANT: Return ONLY valid JSON, no other text. Do not include markdown formatting.
If the article is not relevant to UPSC/CDS exams, return:
{"error": "Article not relevant to UPSC/CDS exam preparation"}`;

/**
 * Valid tags for news articles
 */
const VALID_TAGS = ["Polity", "Economy", "Defense", "Science", "International"];

/**
 * Validate the AI response
 * @param {object} data - Parsed JSON response
 * @returns {object} Validation result with isValid and errors
 */
function validateResponse(data) {
  const errors = [];

  if (!data) {
    return { isValid: false, errors: ["Response is null or undefined"] };
  }

  // Check for error response
  if (data.error) {
    return { isValid: false, errors: [data.error] };
  }

  // Validate headline
  if (
    !data.headline ||
    typeof data.headline !== "string" ||
    data.headline.length < 10 ||
    data.headline.length > 200
  ) {
    errors.push("Headline must be 10-200 characters");
  }

  // Validate summary
  if (
    !data.summary ||
    typeof data.summary !== "string" ||
    data.summary.length < 50 ||
    data.summary.length > 1000
  ) {
    errors.push("Summary must be 50-1000 characters");
  }

  // Validate bulletPoints
  if (
    !Array.isArray(data.bulletPoints) ||
    data.bulletPoints.length < 3 ||
    data.bulletPoints.length > 10
  ) {
    errors.push("Must have 3-10 bullet points");
  } else {
    data.bulletPoints.forEach((point, index) => {
      if (typeof point !== "string" || point.length === 0) {
        errors.push(`Bullet point ${index + 1} is invalid`);
      }
    });
  }

  // Validate tags
  if (
    !Array.isArray(data.tags) ||
    data.tags.length < 1 ||
    data.tags.length > 3
  ) {
    errors.push("Must have 1-3 tags");
  } else {
    data.tags.forEach((tag) => {
      if (!VALID_TAGS.includes(tag)) {
        errors.push(
          `Invalid tag: ${tag}. Valid tags: ${VALID_TAGS.join(", ")}`,
        );
      }
    });
  }

  // Validate subtopics (optional, 0-5)
  if (data.subtopics) {
    if (!Array.isArray(data.subtopics) || data.subtopics.length > 5) {
      errors.push("Subtopics must be 0-5 items");
    }
  } else {
    data.subtopics = [];
  }

  // Validate quiz (optional, 0-5 questions)
  if (data.quiz) {
    if (!Array.isArray(data.quiz) || data.quiz.length > 5) {
      errors.push("Quiz must have 0-5 questions");
    } else {
      data.quiz.forEach((question, index) => {
        if (!question.question || typeof question.question !== "string") {
          errors.push(`Quiz question ${index + 1}: question is required`);
        }
        if (!Array.isArray(question.options) || question.options.length !== 4) {
          errors.push(
            `Quiz question ${index + 1}: must have exactly 4 options`,
          );
        }
        if (
          !question.answer ||
          !["A", "B", "C", "D"].includes(question.answer)
        ) {
          errors.push(
            `Quiz question ${index + 1}: answer must be A, B, C, or D`,
          );
        }
      });
    }
  } else {
    data.quiz = [];
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Call OpenAI API with retry logic
 * @param {string} userMessage - User's article text
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<object>} Parsed JSON response
 */
async function callOpenAIAPI(userMessage, retries = 3) {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured in environment variables");
  }

  const requestBody = {
    model: "gpt-4-turbo",
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Please analyze this news article and provide the output in the following JSON format. Do NOT include markdown formatting or code blocks - return only valid JSON:

{
  "headline": "Clear, concise headline (10-200 chars)",
  "summary": "3-line summary (50-1000 chars)",
  "bulletPoints": ["Point 1", "Point 2", "Point 3"],
  "tags": ["Polity/Economy/Defense/Science/International"],
  "subtopics": ["Optional subtopic 1"],
  "quiz": [
    {
      "question": "MCQ question relevant for UPSC/CDS exam",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "A"
    }
  ]
}

Article to analyze:
${userMessage}`,
      },
    ],
    temperature: 0.7,
    max_tokens: 1500,
  };

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    const content = response.data.choices[0].message.content;

    // Extract JSON from response (remove markdown formatting if present)
    let jsonStr = content;
    if (content.includes("```json")) {
      jsonStr = content.split("```json")[1].split("```")[0];
    } else if (content.includes("```")) {
      jsonStr = content.split("```")[1].split("```")[0];
    }

    const parsedData = JSON.parse(jsonStr.trim());
    return parsedData;
  } catch (error) {
    // Handle specific error types
    if (error.response?.status === 401) {
      throw new Error("OpenAI API authentication failed - invalid API key");
    }

    if (error.response?.status === 429) {
      if (retries > 0) {
        // Rate limited - wait and retry
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 * (4 - retries)),
        );
        return callOpenAIAPI(userMessage, retries - 1);
      }
      throw new Error("OpenAI API rate limited - too many requests");
    }

    if (error.response?.status === 500) {
      if (retries > 0) {
        // Server error - wait and retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return callOpenAIAPI(userMessage, retries - 1);
      }
      throw new Error("OpenAI API server error - please try again later");
    }

    if (error.code === "ECONNABORTED") {
      if (retries > 0) {
        return callOpenAIAPI(userMessage, retries - 1);
      }
      throw new Error("OpenAI API request timeout - please try again");
    }

    if (error instanceof SyntaxError) {
      throw new Error(
        "Failed to parse OpenAI response - invalid JSON returned",
      );
    }

    // Log unexpected errors for debugging
    console.error("OpenAI API Error:", error.message);
    throw error;
  }
}

/**
 * Main summarization function
 * Converts raw article text to structured UPSC-relevant content
 * @param {string} articleText - Raw article text to summarize
 * @returns {Promise<object>} Structured article data with validation
 */
export async function summarizeArticle(articleText) {
  // Input validation
  if (!articleText || typeof articleText !== "string") {
    throw new Error("Article text must be a non-empty string");
  }

  if (articleText.length < 100) {
    throw new Error("Article must be at least 100 characters long");
  }

  if (articleText.length > 10000) {
    throw new Error("Article must be less than 10,000 characters");
  }

  try {
    // Call OpenAI API
    const result = await callOpenAIAPI(articleText);

    // Validate response
    const validation = validateResponse(result);

    if (!validation.isValid) {
      throw new Error(
        `AI response validation failed: ${validation.errors.join(", ")}`,
      );
    }

    // Ensure all required fields exist
    return {
      headline: result.headline,
      summary: result.summary,
      bulletPoints: result.bulletPoints,
      tags: result.tags,
      subtopics: result.subtopics || [],
      quiz: result.quiz || [],
      source: "ai-generated",
      processedAt: new Date(),
    };
  } catch (error) {
    // Enhanced error handling
    if (error.message.includes("not relevant to UPSC/CDS")) {
      throw {
        statusCode: 400,
        message: "Article not relevant to UPSC/CDS exam preparation",
        isNotRelevant: true,
      };
    }

    throw {
      statusCode: 500,
      message: error.message || "Failed to summarize article",
    };
  }
}

/**
 * Batch summarization for multiple articles
 * @param {string[]} articles - Array of article texts
 * @returns {Promise<object[]>} Array of summarized articles
 */
export async function summarizeArticles(articles) {
  if (!Array.isArray(articles) || articles.length === 0) {
    throw new Error("Articles must be a non-empty array");
  }

  if (articles.length > 10) {
    throw new Error("Maximum 10 articles per batch");
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < articles.length; i++) {
    try {
      const result = await summarizeArticle(articles[i]);
      results.push({
        index: i,
        success: true,
        data: result,
      });
    } catch (error) {
      errors.push({
        index: i,
        success: false,
        error: error.message || "Unknown error",
      });
    }

    // Rate limiting - wait 500ms between API calls
    if (i < articles.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return {
    total: articles.length,
    successful: results.length,
    failed: errors.length,
    results,
    errors,
  };
}

/**
 * Extract key information from article preview
 * Use this for quick validation before full processing
 * @param {string} articlePreview - First 200-300 chars of article
 * @returns {Promise<object>} Quick analysis result
 */
export async function quickAnalyze(articlePreview) {
  if (!articlePreview || articlePreview.length < 50) {
    throw new Error("Article preview must be at least 50 characters");
  }

  const systemPrompt = `You are an expert at quickly determining if a news article is relevant to UPSC/CDS exam preparation.

Respond with JSON:
{
  "isRelevant": boolean,
  "primaryTopic": "Polity|Economy|Defense|Science|International|Other",
  "confidence": 0-100,
  "reason": "Brief reason"
}

Do NOT include markdown formatting.`;

  try {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Quick analyze: ${articlePreview}`,
          },
        ],
        temperature: 0.5,
        max_tokens: 200,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    const content = response.data.choices[0].message.content;
    const result = JSON.parse(content.trim());

    return result;
  } catch (error) {
    throw new Error(`Quick analysis failed: ${error.message}`);
  }
}

export default {
  summarizeArticle,
  summarizeArticles,
  quickAnalyze,
};
