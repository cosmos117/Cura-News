/**
 * Rate limiting middleware
 *
 * The AI and news-ingestion endpoints spend real money on paid upstream APIs
 * (OpenAI, NewsAPI) and were previously reachable with no throttle at all, so
 * an anonymous loop could exhaust the account budget in minutes.
 */

import rateLimit from "express-rate-limit";

/**
 * Build a rate limiter.
 * @param {Object} options
 * @param {number} options.windowMs - Window length in ms
 * @param {number} options.max - Requests allowed per window
 * @param {string} options.message - Body message returned when limited
 * @param {boolean} [options.enabled] - Set false to disable the limiter
 *   entirely. Only the AI/pipeline limiters may opt out (they cost money per
 *   call and are annoying while iterating locally).
 */
const createLimiter = ({
  windowMs,
  max,
  message,
  enabled = true,
}) => {
  if (!enabled) {
    // Pass-through middleware, so route definitions stay unchanged.
    return (req, res, next) => next();
  }

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Key on the authenticated user when present so one abusive account
    // cannot exhaust a shared IP bucket in a college/NAT environment.
    keyGenerator: (req, res) => req.user?.userId || req.ip,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message,
      });
    },
  });
};

/** Broad limiter for the whole API surface. */
export const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: "Too many requests. Please try again in a few minutes.",
});

/**
 * Strict limiter for credential endpoints - mitigates brute-force and
 * credential-stuffing attempts. Active in every environment; disabling it
 * outside production would leave dev/staging deployments unprotected.
 */
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many authentication attempts. Please try again later.",
});

/**
 * Limiter for AI endpoints. Each call is a billed OpenAI request, so this one
 * can be disabled locally via RATE_LIMIT_AI=false while iterating.
 */
export const aiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message:
    "AI request limit reached. Please wait before requesting more summaries.",
  enabled: process.env.RATE_LIMIT_AI !== "false",
});

/**
 * Limiter for the daily news pipeline. Each run issues dozens of upstream
 * requests; the pipeline also holds an in-flight lock as a second line of
 * defence.
 */
export const pipelineLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Daily pipeline already triggered recently. Please try again later.",
});

/** Limiter for authenticated lazy detailed-summary generation. */
export const detailedLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message:
    "Detailed summary requests are limited. Please wait before trying again.",
  enabled: process.env.RATE_LIMIT_AI !== "false",
});