/**
 * AI Summarization Service
 * Converts raw news articles from various sources into structured summaries
 * Uses Gemini (primary) / Groq (fallback) with structured JSON output
 */

import axios from "axios";
import { config } from "../config/env.js";

const env = config;
const AI_RATE_LIMIT_COOLDOWN_MS = 60_000;
let aiRateLimitedUntil = 0;
let aiRateLimitStrikes = 0;
const AI_CIRCUIT_BREAKER_THRESHOLD = 3;
const AI_CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60_000;

/**
 * System prompt - Instructs the AI to summarize news clearly for general readers
 */
const SYSTEM_PROMPT = `You are an expert news analyst and summarizer.

Your task is to process news articles from various sources and produce clear, neutral summaries for general readers while:
1. Covering stories from any section - politics, business, sports, technology, world, entertainment, and more
2. Creating concise, factual summaries in plain language
3. Highlighting key facts, figures, people, and context
4. Identifying key topics and subtopics

IMPORTANT: Return ONLY valid JSON, no other text. Do not include markdown formatting.`;

const RESPONSE_SCHEMA = `
Return exactly one JSON object with this shape:
{
  "headline": "10-200 character string",
  "gist": "one factual sentence of no more than 25 words",
  "summary": "2-3 factual sentences, 50-1000 characters",
  "keyFacts": ["3-5 short facts that add information not present in headline, gist, or summary"],
  "tags": ["1-3 values chosen only from Polity, Economy, Defense, Science, International"],
  "category": "one of Politics, Business, Sports, Tech, World, Entertainment, Other",
  "subtopics": ["0-5 strings"]
}
Do not repeat the headline or summary in keyFacts. Never use labels such as "Source: ...".
Do not omit required fields, use empty arrays for optional keyFacts and subtopics only, and do not
return markdown, explanations, or any fields outside this object.`;

/**
 * Valid tags for news articles
 */
const VALID_TAGS = ["Polity", "Economy", "Defense", "Science", "International"];

/**
 * Valid broad categories. The AI is only consulted for `category` after the
 * feed label and keyword rules both come up empty, so this is a fallback and
 * must never invalidate an otherwise good summary.
 */
const VALID_CATEGORIES = [
  "Politics",
  "Business",
  "Sports",
  "Tech",
  "World",
  "Entertainment",
  "Other",
];

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const overlapsByNgram = (left, right) => {
  const a = normalizeText(left).split(" ").filter(Boolean);
  const b = normalizeText(right).split(" ").filter(Boolean);
  if (a.length < 3 || b.length < 3) return false;
  const grams = new Set();
  for (let i = 0; i <= b.length - 3; i += 1) grams.add(b.slice(i, i + 3).join(" "));
  let matches = 0;
  for (let i = 0; i <= a.length - 3; i += 1) {
    if (grams.has(a.slice(i, i + 3).join(" "))) matches += 1;
  }
  return matches >= 2;
};

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

  if (
    !data.gist ||
    typeof data.gist !== "string" ||
    data.gist.trim().split(/\s+/).length > 25
  ) {
    errors.push("Gist must be one sentence of no more than 25 words");
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

  if (data.keyFacts !== undefined) {
    if (!Array.isArray(data.keyFacts) || data.keyFacts.length > 5) {
      errors.push("Key facts must contain 0-5 items");
    } else if (data.keyFacts.some((fact) => typeof fact !== "string" || !fact.trim())) {
      errors.push("Key facts must be non-empty strings");
    } else {
      const facts = data.keyFacts.filter(
        (fact) =>
          !/^source\s*:/i.test(fact.trim()) &&
          !normalizeText(data.headline).includes(normalizeText(fact)) &&
          !normalizeText(data.summary).includes(normalizeText(fact)) &&
          !overlapsByNgram(fact, data.summary),
      );
      data.keyFacts = facts;
    }
  } else {
    data.keyFacts = Array.isArray(data.bulletPoints)
      ? data.bulletPoints.slice(0, 5)
      : [];
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

  // Validate category (optional, single value). A bad or missing category is
  // coerced rather than rejected: the caller only uses the AI's category as a
  // last-resort fallback, and discarding an otherwise valid summary over it
  // would waste the whole call.
  if (data.category !== undefined) {
    if (
      typeof data.category !== "string" ||
      !VALID_CATEGORIES.includes(data.category)
    ) {
      data.category = "Other";
    }
  } else {
    data.category = "Other";
  }

  // Validate subtopics (optional, 0-5)
  if (data.subtopics) {
    if (!Array.isArray(data.subtopics) || data.subtopics.length > 5) {
      errors.push("Subtopics must be 0-5 items");
    }
  } else {
    data.subtopics = [];
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Generate and parse a structured JSON response using the shared AI client.
 */
export async function generateStructured({
  systemPrompt,
  userPrompt,
  maxTokens = 1800,
  temperature = 0.2,
}) {
  if (Date.now() < aiRateLimitedUntil) {
    const error = new Error(
      "AI providers are rate-limited; using the rule-based fallback",
    );
    error.statusCode = 429;
    throw error;
  }

  const isRateLimitError = (error) =>
    error?.response?.status === 429 || error?.status === 429;

  const markRateLimited = () => {
    aiRateLimitStrikes += 1;
    aiRateLimitedUntil =
      Date.now() +
      (aiRateLimitStrikes >= AI_CIRCUIT_BREAKER_THRESHOLD
        ? AI_CIRCUIT_BREAKER_COOLDOWN_MS
        : AI_RATE_LIMIT_COOLDOWN_MS);
  };

  const callGroq = async () => {
    if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: env.GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );
    return response.data?.choices?.[0]?.message?.content;
  };

  const callGemini = async () => {
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      { timeout: 30000 },
    );
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  };

  let content;
  const primary = env.AI_PROVIDER.toLowerCase() === "groq" ? callGroq : callGemini;
  const fallback = env.AI_PROVIDER.toLowerCase() === "groq" ? callGemini : callGroq;
  try {
    content = await primary();
  } catch (primaryError) {
    if (isRateLimitError(primaryError)) markRateLimited();
    try {
      content = await fallback();
    } catch (fallbackError) {
      if (isRateLimitError(fallbackError)) markRateLimited();
      const error = new Error(
        `AI providers failed: primary=${primaryError.message}; fallback=${fallbackError.message}`,
      );
      if (
        isRateLimitError(primaryError) ||
        isRateLimitError(fallbackError)
      ) {
        error.statusCode = 429;
      }
      throw error;
    }
  }

  if (!content || typeof content !== "string") {
    throw new Error("AI returned an empty structured response");
  }

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const parsed = parseJsonLenient(fenced ? fenced[1] : content);
  Object.defineProperty(parsed, "__aiMeta", {
    value: {
      provider: env.AI_PROVIDER.toLowerCase() === "groq" ? "groq" : "gemini",
      modelUsed:
        env.AI_PROVIDER.toLowerCase() === "groq"
          ? env.GROQ_MODEL
          : env.GEMINI_MODEL,
    },
    enumerable: false,
  });
  aiRateLimitStrikes = 0;
  return parsed;
}

/**
 * Parse JSON, repairing raw control characters that appear inside string
 * literals. Gemini runs in JSON mode, but the Groq fallback does not, and a
 * model that emits a real newline inside a "detailed" paragraph produces
 * unterminated-string errors. This scanner walks the text, tracks whether it
 * is inside a string literal, and escapes control characters only there -
 * leaving whitespace between tokens untouched.
 */
function parseJsonLenient(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch (initialError) {
    let out = "";
    let inString = false;
    let escaped = false;
    for (const ch of raw) {
      if (inString) {
        if (escaped) {
          out += ch;
          escaped = false;
        } else if (ch === "\\") {
          out += ch;
          escaped = true;
        } else if (ch === '"') {
          out += ch;
          inString = false;
        } else if (ch === "\n") {
          out += "\\n";
        } else if (ch === "\r") {
          out += "\\r";
        } else if (ch === "\t") {
          out += "\\t";
        } else if (ch.charCodeAt(0) < 0x20) {
          out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
        } else {
          out += ch;
        }
      } else {
        if (ch === '"') {
          inString = true;
        }
        out += ch;
      }
    }
    return JSON.parse(out);
  }
}

/**
 * Structured summarization via the configured provider chain.
 *
 * The name is historical. It delegates to generateStructured, which uses the
 * configured provider and fallback chain.
 *
 * @param {string} userMessage - User's article text
 * @returns {Promise<object>} Parsed JSON response
 */
async function callConfiguredAI(userMessage) {
  return generateStructured({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Please analyze this news article and return the CURA JSON schema.
${RESPONSE_SCHEMA}

${userMessage}`,
    maxTokens: 1500,
    temperature: 0.2,
  });
}

/**
 * Main summarization function
 * Converts raw article text to structured news summary content
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
    const result = await callConfiguredAI(articleText);

    // Validate response
    const validation = validateResponse(result);

    if (!validation.isValid) {
      throw new Error(
        `AI response validation failed: ${validation.errors.join(", ")}`,
      );
    }

    // Ensure all required fields exist.
    // NOTE: deliberately no `source` key here. `source` is the publisher in
    // the News schema (enum-constrained) and this is the publisher-less AI
    // output; emitting "ai-generated" overwrote the real source downstream and
    // failed News validation for every article.
    return {
      headline: result.headline,
      gist: result.gist,
      summary: result.summary,
      bulletPoints: result.keyFacts || [],
      keyFacts: result.keyFacts || [],
      tags: result.tags,
      category: result.category,
      subtopics: result.subtopics || [],
      processedAt: new Date(),
    };
  } catch (error) {
    // Enhanced error handling. These must be real Error instances: throwing
    // plain objects left `.name` and `.stack` undefined, which defeated every
    // error-name branch in the global error handler.
    if (error.statusCode && error.statusCode !== 500) {
      throw error;
    }

    if (error.statusCode === 401) {
      throw error;
    }

    const wrapped = new Error(error.message || "Failed to summarize article");
    wrapped.statusCode = 500;
    throw wrapped;
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

  const systemPrompt = `You are an expert at quickly describing a news article for a general news digest.

Respond with JSON:
{
  "primaryTopic": "Polity|Economy|Defense|Science|International|Other",
  "confidence": 0-100,
  "reason": "Brief reason"
}

Do NOT include markdown formatting.`;

  // Routed through generateStructured so this honours AI_PROVIDER and the
  // Gemini -> Groq fallback like every other AI call.
  try {
    return await generateStructured({
      systemPrompt,
      userPrompt: `Quick analyze: ${articlePreview}`,
      maxTokens: 200,
      temperature: 0.5,
    });
  } catch (error) {
    throw new Error(`Quick analysis failed: ${error.message}`);
  }
}

export default {
  summarizeArticle,
  summarizeArticles,
  quickAnalyze,
  generateStructured,
};
