import crypto from "node:crypto";
import { config } from "../config/env.js";

/**
 * True when `provided` equals CRON_SECRET. Both sides are hashed first so the
 * comparison takes the same time whatever the length of the guess. An unset
 * CRON_SECRET matches nothing.
 */
export const hasValidCronSecret = (provided) => {
  if (!config.CRON_SECRET || typeof provided !== "string") return false;
  const digest = (value) => crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(digest(config.CRON_SECRET), digest(provided));
};

/**
 * Operator-only routes: the caller must send CRON_SECRET in the
 * `x-cron-secret` header. A reader's sign-in token is not enough.
 */
export const requireCronSecret = (req, res, next) => {
  if (!hasValidCronSecret(req.get("x-cron-secret"))) {
    return res.status(401).json({ success: false, message: "Invalid cron secret" });
  }
  return next();
};
