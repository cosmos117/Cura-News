import express from "express";
import { requireCronSecret } from "../middleware/adminAuth.js";
import { pipelineLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/ingest", pipelineLimiter, requireCronSecret, async (req, res) => {
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
