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

  // AI providers. These are the only providers any code path calls, via
  // generateStructured (primary + fallback).
  GEMINI_API_KEY: getEnv("GEMINI_API_KEY", ""),
  // Model IDs verified against the live APIs on 2026-10-05: both return 200
  // with these keys. Older defaults (gemini-2.0-flash, llama-3.3-70b-versatile)
  // are retired and answer 404, which silently forces every AI call onto the
  // fallback provider.
  GEMINI_MODEL: getEnv("GEMINI_MODEL", "gemini-3.8-flash"),
  GROQ_API_KEY: getEnv("GROQ_API_KEY", ""),
  GROQ_MODEL: getEnv("GROQ_MODEL", "openai/gpt-oss-120b"),
  AI_PROVIDER: getEnv("AI_PROVIDER", "gemini"),

  // CORS
  // Comma-separated list of allowed origins. Default matches the Vite dev
  // server port declared in frontend/vite.config.js.
  CORS_ORIGIN: getEnv("CORS_ORIGIN", "http://localhost:3000"),
  CRON_SECRET: getEnv("CRON_SECRET", ""),
  TRUST_PROXY: parseInt(getEnv("TRUST_PROXY", "1"), 10),

  // Detailed summaries
  DETAILED_TOP_N: parseInt(getEnv("DETAILED_TOP_N", "30"), 10),
  MIN_TEXT_CHARS: parseInt(getEnv("MIN_TEXT_CHARS", "800"), 10),
  INPUT_MAX_CHARS: parseInt(getEnv("INPUT_MAX_CHARS", "30000"), 10),
  AI_DAILY_LIMIT: parseInt(getEnv("AI_DAILY_LIMIT", "100"), 10),
  AI_DELAY_MS: parseInt(getEnv("AI_DELAY_MS", "500"), 10),
  FETCH_TIMEOUT_MS: parseInt(getEnv("FETCH_TIMEOUT_MS", "10000"), 10),
  MIN_ARTICLES_BEFORE_CLEANUP: parseInt(getEnv("MIN_ARTICLES_BEFORE_CLEANUP", "5"), 10),

  // Derived flags
  isDevelopment: getEnv("NODE_ENV", "development") === "development",
  isProduction: getEnv("NODE_ENV", "development") === "production",
  isTest: getEnv("NODE_ENV", "development") === "test",
  // Ingestion scheduler
  INGEST_INTERVAL_MINUTES: parseInt(getEnv("INGEST_INTERVAL_MINUTES", "15"), 10),
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
