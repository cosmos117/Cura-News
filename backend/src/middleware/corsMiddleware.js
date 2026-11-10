import cors from "cors";
import { config } from "../config/env.js";
import { AppError } from "./errorHandler.js";

/**
 * Parse CORS_ORIGIN into a list of allowed origins.
 *
 * It accepts a comma-separated list. Passing the raw string as a single
 * `origin` meant a multi-origin config silently never matched anything.
 * Trailing slashes are dropped: a browser's Origin header never has one, but
 * a pasted site URL usually does, and that mismatch blocks every request.
 *
 * @param {string} value - Raw CORS_ORIGIN
 * @returns {string[]}
 */
export const parseAllowedOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const allowedOrigins = parseAllowedOrigins(config.CORS_ORIGIN);

const corsOptions = {
  origin: (origin, callback) => {
    // Same-origin/non-browser callers send no Origin header.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // A refusal, not a server fault: 403 without the stack-trace noise a
    // plain Error (500) would log for every stray cross-site request.
    return callback(new AppError("Origin is not allowed", 403));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

/**
 * Development - allow any origin, without credentials.
 *
 * Note the dev frontend runs on http://localhost:3000 (see vite.config.js),
 * which is what CORS_ORIGIN defaults to.
 */
const corsOptionsDev = {
  origin: "*",
  credentials: false,
  optionsSuccessStatus: 200,
};

export const corsMiddleware = () => {
  return config.isDevelopment ? cors(corsOptionsDev) : cors(corsOptions);
};