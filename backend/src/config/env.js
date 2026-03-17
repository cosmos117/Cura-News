/**
 * Environment configuration
 * Centralized place to access all environment variables
 */

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

  // OpenAI
  OPENAI_API_KEY: getEnv("OPENAI_API_KEY", ""),

  // CORS
  CORS_ORIGIN: getEnv("CORS_ORIGIN", "http://localhost:5173"),

  // News API
  NEWS_API_KEY: getEnv("NEWS_API_KEY", ""),

  // Derived flags
  isDevelopment: getEnv("NODE_ENV", "development") === "development",
  isProduction: getEnv("NODE_ENV", "development") === "production",
};

// Validate critical env vars in production
if (config.isProduction) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️ Warning: OPENAI_API_KEY not set in production");
  }
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET === "default_secret_change_in_production"
  ) {
    throw new Error(
      "❌ JWT_SECRET must be set to a secure value in production",
    );
  }
}

export default config;
