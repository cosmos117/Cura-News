import mongoose from "mongoose";
import { withTopicLabels } from "../config/topics.js";
import Bookmark, { BOOKMARK_TTL_MS } from "../models/Bookmark.js";
import News from "../models/News.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";

const validateArticleId = (articleId) => {
  if (!mongoose.Types.ObjectId.isValid(articleId)) {
    throw new AppError("Invalid article ID format", 400);
  }
};

const findPublishedArticle = async (articleId) => {
  const article = await News.findOne({ _id: articleId, isPublished: true });
  if (!article) {
    throw new AppError("News article not found", 404);
  }
  return article;
};

/**
 * The article a bookmark shows: the live article while it still exists,
 * otherwise the stored snapshot. An archived article can no longer have a
 * detailed summary generated, so anything short of DONE reads as UNAVAILABLE.
 */
const toBookmarkedArticle = (bookmark, liveArticle) => {
  const base = liveArticle
    ? { ...Bookmark.snapshotFrom(liveArticle), archived: false }
    : {
        ...withTopicLabels(bookmark.snapshot),
        archived: true,
        detailedStatus:
          bookmark.snapshot.detailedStatus === "DONE" ? "DONE" : "UNAVAILABLE",
      };
  return {
    ...base,
    bookmarkedAt: bookmark.createdAt,
    expiresAt: bookmark.expiresAt,
  };
};

export const saveBookmark = asyncHandler(async (req, res) => {
  const { articleId } = req.params;
  validateArticleId(articleId);
  const article = await findPublishedArticle(articleId);

  // $min keeps the original expiry if the bookmark already exists, and also
  // fills it in for bookmarks created before expiry was introduced.
  await Bookmark.updateOne(
    { user: req.user.userId, article: articleId },
    {
      $set: { snapshot: Bookmark.snapshotFrom(article) },
      $min: { expiresAt: new Date(Date.now() + BOOKMARK_TTL_MS) },
      $setOnInsert: { user: req.user.userId, article: articleId },
    },
    { upsert: true },
  );

  res.status(200).json({
    success: true,
    message: "Article saved",
    data: { articleId, bookmarked: true },
  });
});

export const removeBookmark = asyncHandler(async (req, res) => {
  const { articleId } = req.params;
  validateArticleId(articleId);

  await Bookmark.deleteOne({
    user: req.user.userId,
    article: articleId,
  });

  res.status(200).json({
    success: true,
    message: "Article removed from saved articles",
    data: { articleId, bookmarked: false },
  });
});

export const getBookmarkStatus = asyncHandler(async (req, res) => {
  const { articleId } = req.params;
  validateArticleId(articleId);

  const bookmark = await Bookmark.findOne(
    Bookmark.activeFilter({ user: req.user.userId, article: articleId }),
  )
    .select("expiresAt")
    .lean();

  res.status(200).json({
    success: true,
    data: {
      articleId,
      bookmarked: Boolean(bookmark),
      expiresAt: bookmark?.expiresAt || null,
    },
  });
});

/** One saved article, readable even after the article itself was deleted. */
export const getBookmark = asyncHandler(async (req, res) => {
  const { articleId } = req.params;
  validateArticleId(articleId);

  const bookmark = await Bookmark.findOne(
    Bookmark.activeFilter({ user: req.user.userId, article: articleId }),
  ).lean();
  if (!bookmark) {
    throw new AppError("Saved article not found or expired", 404);
  }

  const liveArticle = await News.findOne({ _id: articleId, isPublished: true }).lean();

  res.status(200).json({
    success: true,
    data: toBookmarkedArticle(bookmark, liveArticle),
  });
});

export const getBookmarks = asyncHandler(async (req, res) => {
  const parsedLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const parsedSkip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
  const filter = Bookmark.activeFilter({ user: req.user.userId });

  const [total, bookmarks] = await Promise.all([
    Bookmark.countDocuments(filter),
    Bookmark.find(filter)
      .sort({ createdAt: -1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .lean(),
  ]);

  const liveArticles = await News.find({
    _id: { $in: bookmarks.map((bookmark) => bookmark.article) },
    isPublished: true,
  }).lean();
  const liveById = new Map(liveArticles.map((article) => [String(article._id), article]));

  // Every active bookmark carries a snapshot, so nothing is dropped here and
  // `total` matches what the list can actually show.
  const data = bookmarks.map((bookmark) =>
    toBookmarkedArticle(bookmark, liveById.get(String(bookmark.article))),
  );

  res.status(200).json({
    success: true,
    pagination: {
      total,
      limit: parsedLimit,
      skip: parsedSkip,
      hasMore: total > parsedSkip + parsedLimit,
    },
    data,
  });
});
