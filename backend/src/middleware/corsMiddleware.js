import cors from "cors";
import { config } from "../config/env.js";

/**
 * Allowed origins, parsed from CORS_ORIGIN.
 *
 * CORS_ORIGIN accepts a comma-separated list. Passing the raw string as a
 * single `origin` meant a multi-origin config silently never matched anything.
 */
const allowedOrigins = config.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Same-origin/non-browser callers send no Origin header.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
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