import crypto from "node:crypto";
import express from "express";
import { config } from "../config/env.js";
import { pipelineLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

const hasValidCronSecret = (provided) => {
  if (!config.CRON_SECRET || typeof provided !== "string") return false;
  const expected = Buffer.from(config.CRON_SECRET);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

router.post("/ingest", pipelineLimiter, async (req, res) => {
  if (!hasValidCronSecret(req.get("x-cron-secret"))) {
    return res.status(401).json({ success: false, message: "Invalid cron secret" });
  }

  const { dryRun = false, skipAIFilter = false } = req.body || {};
  res.status(202).json({
    success: true,
    message: "Daily news pipeline started. Processing in background...",
  });

  try {
    const { default: newsProcessor } = await import("../services/newsProcessor.js");
    const report = await newsProcessor.processDailyNews({
      dryRun: dryRun === true,
      skipAIFilter: skipAIFilter === true,
    });
    console.log("Admin ingest completed:", report);
  } catch (error) {
    console.error("Admin ingest failed:", error.message);
  }
});

export default router;
