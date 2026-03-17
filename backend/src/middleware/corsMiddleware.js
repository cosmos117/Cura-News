import cors from "cors";
import { config } from "../config/env.js";

/**
 * CORS Configuration
 * Restricts API access to allowed origins only
 */
const corsOptions = {
  origin: config.CORS_ORIGIN,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

/**
 * For development - allow all origins (if needed)
 */
const corsOptionsDev = {
  origin: "*",
  credentials: false,
  optionsSuccessStatus: 200,
};

export const corsMiddleware = () => {
  return config.isDevelopment ? cors(corsOptionsDev) : cors(corsOptions);
};
