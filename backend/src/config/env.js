/**
 * Environment configuration
 * Centralized place to access all environment variables
 */

// Load .env BEFORE reading process.env below. ESM hoists imports, so this must
// be the first import in this module - otherwise config captures defaults.
import "./dotenv.js";

const getEnv = (key, defaultValue) => {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not defined`);
  }
  return value || defaultValue;
};

export const config = {
  // Server
  PORT: parseInt(getEnv("PORT", "5000")),
  NODE_ENV: getEnv("NODE_ENV", "development"),

  // Database
  MONGO_URI: getEnv("MONGO_URI", "mongodb://localhost:27017/cura-news"),

  // JWT
  JWT_SECRET: getEnv("JWT_SECRET", "default_secret_change_in_production"),
  JWT_EXPIRE: getEnv("JWT_EXPIRE", "7d"),

  // Google sign-in. The OAuth client ID that issued the ID token; tokens for
  // any other audience are rejected. Empty disables POST /api/auth/google.
  GOOGLE_CLIENT_ID: getEnv("GOOGLE_CLIENT_ID", ""),

  // AI providers, called only through aiService.generateStructured.
  GEMINI_API_KEY: getEnv("GEMINI_API_KEY", ""),
  GROQ_API_KEY: getEnv("GROQ_API_KEY", ""),
  // Which provider's models are tried first: "groq" or "gemini".
  AI_PROVIDER: getEnv("AI_PROVIDER", "gemini"),
  // The model pool, comma-separated and best first. Free tiers limit each
  // model separately, so every listed model adds quota. Empty uses the
  // defaults in aiService.js (the free models measured on these keys).
  GROQ_MODELS: getEnv("GROQ_MODELS", ""),
  GEMINI_MODELS: getEnv("GEMINI_MODELS", ""),

  // AI pacing (see aiService.js). Requests per minute per model; 0 uses the
  // free-tier figure for each model (Groq 30, Gemini flash-lite 15, flash 5).
  GEMINI_RPM: parseInt(getEnv("GEMINI_RPM", "0"), 10),
  GROQ_RPM: parseInt(getEnv("GROQ_RPM", "0"), 10),
  // Capacity background jobs (ingest, the detailed batch) must leave free so
  // a reader's request never queues behind them: tokens per minute (about one
  // detailed summary) and requests per day. Only Groq reports these limits.
  AI_INTERACTIVE_TOKEN_RESERVE: parseInt(getEnv("AI_INTERACTIVE_TOKEN_RESERVE", "4000"), 10),
  AI_INTERACTIVE_REQUEST_RESERVE: parseInt(getEnv("AI_INTERACTIVE_REQUEST_RESERVE", "50"), 10),

  // CORS
  // Comma-separated list of allowed origins. Default matches the Vite dev
  // server port declared in frontend/vite.config.js.
  CORS_ORIGIN: getEnv("CORS_ORIGIN", "http://localhost:3000"),
  CRON_SECRET: getEnv("CRON_SECRET", ""),
  TRUST_PROXY: parseInt(getEnv("TRUST_PROXY", "1"), 10),

  // Detailed summaries are made on demand, when a reader opens the Detailed
  // tab, and then shared with everyone. DETAILED_TOP_N > 0 also pre-generates
  // that many per day in the background (off by default to save free quota).
  DETAILED_TOP_N: parseInt(getEnv("DETAILED_TOP_N", "0"), 10),
  MIN_TEXT_CHARS: parseInt(getEnv("MIN_TEXT_CHARS", "800"), 10),
  // Article text sent for a detailed summary. 8,000 chars (~2,000 tokens)
  // keeps each request well inside Groq's free 8,000 tokens per minute and
  // stretches its 200,000 tokens per day per model further.
  INPUT_MAX_CHARS: parseInt(getEnv("INPUT_MAX_CHARS", "8000"), 10),
  // Safety cap on detailed summaries per day; the free pool allows roughly
  // 1,300-1,500, so this only stops runaway use.
  AI_DAILY_LIMIT: parseInt(getEnv("AI_DAILY_LIMIT", "2000"), 10),
  AI_DELAY_MS: parseInt(getEnv("AI_DELAY_MS", "500"), 10),
  // Short summaries are built from the article page (see content/shortSummary.js).
  // SUMMARY_PAGE_FETCH=false skips the page fetch and uses RSS descriptions and
  // headlines only. PAGE_FETCH_DELAY_MS spaces the requests out politely.
  SUMMARY_PAGE_FETCH: getEnv("SUMMARY_PAGE_FETCH", "true") !== "false",
  PAGE_FETCH_DELAY_MS: parseInt(getEnv("PAGE_FETCH_DELAY_MS", "300"), 10),
  FETCH_TIMEOUT_MS: parseInt(getEnv("FETCH_TIMEOUT_MS", "10000"), 10),
  MIN_ARTICLES_BEFORE_CLEANUP: parseInt(getEnv("MIN_ARTICLES_BEFORE_CLEANUP", "5"), 10),

  // Derived flags
  isDevelopment: getEnv("NODE_ENV", "development") === "development",
  isProduction: getEnv("NODE_ENV", "development") === "production",
  isTest: getEnv("NODE_ENV", "development") === "test",
  // Ingestion scheduler
  INGEST_INTERVAL_MINUTES: parseInt(getEnv("INGEST_INTERVAL_MINUTES", "15"), 10),
  // Most new articles stored per run (0 = no cap). Extra ones wait for the
  // next run while they are still in the feeds.
  INGEST_MAX_PER_RUN: parseInt(getEnv("INGEST_MAX_PER_RUN", "20"), 10),
  // Indian Standard Time offset in minutes (UTC+5:30)
  IST_OFFSET_MINUTES: parseInt(getEnv("IST_OFFSET_MINUTES", "330"), 10),
};

// Validate critical env vars in production
if (config.isProduction) {
  // Provider keys are intentionally not checked here. The live provider
  // chain performs its own configuration check, so warning about absent
  // unused keys would imply a requirement that does not exist. The AI key check lives in
  // server.js so it reports once, with the rest of the boot output.

  const jwtSecret = config.JWT_SECRET;
  const isPlaceholderSecret =
    !jwtSecret ||
    jwtSecret === "default_secret_change_in_production" ||
    jwtSecret === "your_jwt_secret_key_here_change_in_production" ||
    jwtSecret.includes("your_") ||
    jwtSecret.includes("change_in_production") ||
    jwtSecret.includes("changeme");

  if (isPlaceholderSecret) {
    throw new Error(
      "❌ JWT_SECRET must be set to a secure, unique value in production " +
        "(the value in .env.example is public knowledge and must never be reused)",
    );
  }

  if (jwtSecret.length < 32) {
    throw new Error("❌ JWT_SECRET must be at least 32 characters in production");
  }
}

export default config;
