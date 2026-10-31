import News from "../models/News.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { RATE_LIMITED_MESSAGE } from "../services/aiService.js";
import {
  dailyDetailedCount,
  generateDetailedSummary,
  detailedConfig,
} from "../services/detailedSummaryService.js";
import { assertArticleId } from "../utils/newsQuery.js";

/**
 * Answer a detailed request that hit an AI rate limit. The article goes back
 * to NONE rather than FAILED, since nothing is wrong with it, and the reply
 * says when capacity is expected back so the client can retry on its own.
 */
const respondRateLimited = async (res, id, retryAfterMs) => {
  const available = await News.findByIdAndUpdate(
    id,
    {
      $set: {
        detailedStatus: "NONE",
        detailedLockedAt: null,
        lastError: RATE_LIMITED_MESSAGE,
      },
    },
    { new: true, runValidators: true },
  );
  if (!available) throw new AppError("News article not found", 404);

  const retryAfter = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : null;
  if (retryAfter) res.set("Retry-After", String(Math.ceil(retryAfter / 1000)));
  return res.status(429).json({
    success: false,
    message: "AI providers are busy right now. Please try again shortly.",
    retryAfterMs: retryAfter,
    data: available.getPublicNews(),
  });
};

/**
 * Generate or return the cached detailed summary for an article.
 * POST /api/news/:id/detailed
 */
export const generateDetailedNews = asyncHandler(async (req, res) => {
    const { id } = req.params;
    assertArticleId(id);

    const article = await News.findOne({ _id: id, isPublished: true });
    if (!article) throw new AppError("News article not found", 404);

    const hasValidatedFullSource =
      article.detailSourceType === "FULL_TEXT" &&
      Number(article.sourceWordCount) >= 120;

    if (
      article.detailedStatus === "DONE" &&
      article.detailedSummary &&
      hasValidatedFullSource
    ) {
      return res.status(200).json({
        success: true,
        message: "Detailed summary retrieved from cache",
        data: article.getPublicNews(),
      });
    }

    // Discard summaries created before the full-source-only flow. They may
    // have been generated from an RSS snippet or an unclean webpage extract.
    if (article.detailedStatus === "DONE" && !hasValidatedFullSource) {
      await News.updateOne(
        { _id: id },
        {
          $set: { detailedStatus: "NONE", detailedLockedAt: null },
          $unset: {
            detailedSummary: 1,
            detailedGeneratedAt: 1,
            detailedConfidence: 1,
            detailSourceType: 1,
            sourceWordCount: 1,
            sourceTier: 1,
          },
        },
      );
      article.detailedStatus = "NONE";
      article.detailedSummary = null;
    }

    if (article.detailedStatus === "PENDING") {
      const lockAge = Date.now() - (article.detailedLockedAt?.getTime() || 0);
      if (lockAge < 2 * 60 * 1000) {
        return res.status(202).json({
          success: true,
          message: "Generating detailed summary...",
          data: article.getPublicNews(),
        });
      }
      await News.updateOne(
        { _id: id, detailedStatus: "PENDING" },
        { $set: { detailedStatus: "NONE", detailedLockedAt: null } },
      );
    }

    let locked;
    try {
      const generatedToday = await dailyDetailedCount();
      if (generatedToday >= detailedConfig.AI_DAILY_LIMIT) {
        return res.status(429).json({
          success: false,
          message: "Detailed summary will be available soon",
        });
      }

      locked = await News.findOneAndUpdate(
        {
          _id: id,
          isPublished: true,
          detailedStatus: { $in: ["NONE", "FAILED", "UNAVAILABLE"] },
        },
        { $set: { detailedStatus: "PENDING", detailedLockedAt: new Date() } },
        { new: true },
      );
    } catch (error) {
      console.error("Detailed summary request setup failed:", {
        articleId: id,
        message: error.message,
      });
      return res.status(503).json({
        success: false,
        message: "Detailed summary service is temporarily unavailable. Please try again.",
      });
    }

    if (!locked) {
      const current = await News.findById(id);
      return res.status(202).json({
        success: true,
        message:
          current?.detailedStatus === "DONE"
            ? "Detailed summary retrieved from cache"
            : "Generating detailed summary...",
        data: current?.getPublicNews(),
      });
    }

    let result;
    try {
      result = await generateDetailedSummary(locked, { priority: "interactive" });
    } catch (error) {
      console.error("Detailed summary generation failed:", {
        articleId: id,
        message: error.message,
      });

      if (error.statusCode === 429) {
        return respondRateLimited(res, id, error.retryAfterMs);
      }

      const failed = await News.findByIdAndUpdate(
        id,
        {
          $set: {
            detailedStatus: "FAILED",
            detailedLockedAt: null,
            detailSourceType: "SNIPPET_ONLY",
            lastError: String(error.message || "Detailed summary generation failed").slice(0, 500),
          },
          $unset: {
            detailedSummary: 1,
            detailedGeneratedAt: 1,
            detailedConfidence: 1,
          },
        },
        { new: true, runValidators: true },
      );

      if (!failed) throw new AppError("News article not found", 404);
      return res.status(422).json({
        success: false,
        message: "Detailed summary generation failed. Please try again.",
        data: failed.getPublicNews(),
      });
    }

    if (result.status === "RATE_LIMITED") {
      return respondRateLimited(res, id, result.retryAfterMs);
    }

    // Normalise the result status so any unexpected value is treated as a
    // failure rather than falling through with inconsistent state.
    const status = result.status === "DONE" ? "DONE" : result.status === "FAILED" ? "FAILED" : "UNAVAILABLE";

    const update = {
      detailedStatus: status,
      detailSourceType: result.detailSourceType ?? "SNIPPET_ONLY",
      detailedLockedAt: null,
    };

    if (status === "DONE") {
      // v2: the detailed narrative never rewrites the headline; it only
      // fills the detailed fields and may refine tags. The topic never changes.
      update.detailedSummary = result.detailed;
      update.detailedConfidence = result.confidence;
      update.detailedGeneratedAt = new Date();
      update.tags = result.tags?.length > 0 ? result.tags : locked.tags;
      update.promptVersion = result.promptVersion;
      update.sourceWordCount = result.sourceWordCount;
      if (result.sourceTier) update.sourceTier = result.sourceTier;
      update.$unset = {
        lastError: 1,
      };
    } else {
      // FAILED or UNAVAILABLE: clear the detailed narrative and record why.
      // Use $unset (not `undefined`) so Mongoose never tries to validate an
      // undefined value against the String field.
      update.$unset = {
        detailedSummary: 1,
        detailedGeneratedAt: 1,
        detailedConfidence: 1,
      };
      update.lastError = (
        result.reason ||
        (status === "UNAVAILABLE"
          ? "Detailed summary is unavailable. Read the full story at the source."
          : "Detailed summary generation failed")
      ).slice(0, 500);
      update.$unset.sourceTier = 1;
    }

    let saved;
    try {
      saved = await News.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      });
    } catch (error) {
      console.error("Detailed summary persistence failed:", {
        articleId: id,
        message: error.message,
      });

      try {
        saved = await News.findByIdAndUpdate(
          id,
          {
            $set: {
              detailedStatus: "FAILED",
              detailSourceType: "SNIPPET_ONLY",
              lastError: "Detailed summary could not be saved",
            },
            $unset: {
              detailedSummary: 1,
              detailedGeneratedAt: 1,
              detailedConfidence: 1,
              sourceTier: 1,
            },
          },
          { new: true, runValidators: true },
        );
      } catch (fallbackError) {
        console.error("Detailed summary failure state could not be saved:", {
          articleId: id,
          message: fallbackError.message,
        });
        return res.status(503).json({
          success: false,
          message: "Detailed summary service is temporarily unavailable. Please try again.",
        });
      }

      if (!saved) throw new AppError("News article not found", 404);
      return res.status(422).json({
        success: false,
        message: "Detailed summary could not be saved. Please try again.",
        data: saved.getPublicNews(),
      });
    }
    if (!saved) throw new AppError("News article not found", 404);

    return res.status(status === "DONE" ? 200 : 422).json({
      success: status !== "FAILED",
      message:
        status === "DONE"
          ? "Detailed summary generated"
          : status === "UNAVAILABLE"
            ? "Detailed summary is unavailable. Read the full story at the source."
            : "Detailed summary generation failed. Please try again.",
      data: saved.getPublicNews(),
  });
});
