import express from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getPublicStats } from "../services/usageStats.js";

const router = express.Router();

/**
 * GET /api/stats
 * Public reader count for the landing page: { readers }. Cached for a few
 * minutes.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.status(200).json({ success: true, data: await getPublicStats() });
  }),
);

export default router;
