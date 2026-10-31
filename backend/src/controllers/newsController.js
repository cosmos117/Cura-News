import News from "../models/News.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { NEWS_CATEGORIES } from "../utils/category.js";
import {
  VALID_SOURCES,
  VALID_TAGS,
  assertArticleId,
  paginationOf,
  parsePagination,
  todayFilter,
} from "../utils/newsQuery.js";

/**
 * Get a single news article by ID
 * GET /api/news/:id
 *
 * @param {Object} req - Express request object
 * @param {string} req.params.id - News article ID
 * @param {Object} res - Express response object
 * @returns {Object} - { success, data: news article }
 */
export const getNewsByID = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  assertArticleId(id);

  // Find news article
  const news = await News.findById(id);

  if (!news) {
    throw new AppError("News article not found", 404);
  }

  if (!news.isPublished) {
    throw new AppError("This article is not published", 404);
  }

  res.status(200).json({
    success: true,
    message: "News article retrieved successfully",
    data: news.getPublicNews(),
  });
});

/**
 * Create a new news article (with AI-processed data)
 * POST /api/news
 *
 * @param {Object} req - Express request object
 * @param {string} req.body.source - News source (required)
 * @param {Date} req.body.date - Publication date (optional, defaults to now)
 * @param {string} req.body.headline - Article headline (required)
 * @param {string} req.body.summary - AI-generated summary (required)
 * @param {string[]} req.body.bulletPoints - Key bullet points (required, 3-10)
 * @param {string[]} req.body.tags - Tags (required, 1-3)
 * @param {string} [req.body.category] - Broad category (optional; defaults to
 * "Misc"). One of the fifteen configured topics,
 *   Other
 * @param {string[]} req.body.subtopics - Subtopics (optional, max 5)
 * @param {string} req.body.url - Original article URL (optional)
 * @param {Object} res - Express response object
 * @returns {Object} - { success, message, data: created news }
 */
export const createNews = asyncHandler(async (req, res, next) => {
  const {
    source,
    date,
    headline,
    summary,
    bulletPoints,
    keyFacts,
    tags,
    category,
    subtopics,
    url,
  } = req.body;

  // Validate required fields
  if (!source || !headline || !summary || (!bulletPoints && !keyFacts) || !tags) {
    throw new AppError(
      "Please provide: source, headline, summary, bulletPoints, and tags",
      400,
    );
  }

  // Validate source enum
  if (!VALID_SOURCES.includes(source)) {
    throw new AppError(
      `Source must be one of: ${VALID_SOURCES.join(", ")}`,
      400,
    );
  }

  // Validate category enum when supplied. Optional: an omitted category falls
  // back to "Misc" so manual creation does not require the caller to know the
  // taxonomy.
  if (category !== undefined && !NEWS_CATEGORIES.includes(category)) {
    throw new AppError(
      `Invalid category: ${category}. Valid categories: ${NEWS_CATEGORIES.join(", ")}`,
      400,
    );
  }

  // Validate tags enum
  const tagsArray = Array.isArray(tags) ? tags : [tags];
  const invalidTags = tagsArray.filter((tag) => !VALID_TAGS.includes(tag));

  if (invalidTags.length > 0) {
    throw new AppError(
      `Invalid tags: ${invalidTags.join(", ")}. Valid tags: ${VALID_TAGS.join(", ")}`,
      400,
    );
  }

  // Validate bullet points count
  const bulletPointsArray = Array.isArray(keyFacts || bulletPoints)
    ? (keyFacts || bulletPoints)
    : [keyFacts || bulletPoints];
  if (bulletPointsArray.length > 5) {
    throw new AppError("Must provide no more than 5 key facts", 400);
  }

  // Validate tags count
  if (tagsArray.length < 1 || tagsArray.length > 3) {
    throw new AppError("Must have between 1 and 3 tags", 400);
  }

  // Create news article
  const newsArticle = new News({
    source,
    date: date ? new Date(date) : new Date(),
    headline,
    summary,
    bulletPoints: bulletPointsArray,
    keyFacts: bulletPointsArray,
    tags: tagsArray,
    category,
    subtopics: subtopics || [],
    url,
    isPublished: true,
  });

  // Save to database
  await newsArticle.save();

  res.status(201).json({
    success: true,
    message: "News article created successfully",
    data: {
      id: newsArticle._id,
      source: newsArticle.source,
      headline: newsArticle.headline,
      tags: newsArticle.tags,
      category: newsArticle.category,
      date: newsArticle.date,
    },
  });
});

/**
 * Get news by tag
 * GET /api/news/tag/:tagName
 *
 * @param {Object} req - Express request object
 * @param {string} req.params.tagName - Tag name to filter by
 * @param {number} req.query.limit - Pagination limit (default: 10, max: 50)
 * @param {number} req.query.skip - Pagination offset (default: 0)
 * @param {Object} res - Express response object
 * @returns {Object} - { success, count, data: [news articles] }
 */
export const getNewsByTag = asyncHandler(async (req, res, next) => {
  const { tagName } = req.params;

  // Validate tag
  if (!VALID_TAGS.includes(tagName)) {
    throw new AppError(
      `Invalid tag. Valid tags: ${VALID_TAGS.join(", ")}`,
      400,
    );
  }

  const page = parsePagination(req.query, 50);

  const totalCount = await News.countDocuments({
    tags: tagName,
    isPublished: true,
  });

  const news = await News.find({ tags: tagName, isPublished: true })
    .sort({ date: -1 })
    .limit(page.limit)
    .skip(page.skip)
    .exec();

  const publicNews = news.map((article) => article.getPublicNews());

  res.status(200).json({
    success: true,
    message: `Found ${news.length} articles with tag: ${tagName}`,
    pagination: paginationOf(totalCount, page),
    data: publicNews,
  });
});

/**
 * Get news by source
 * GET /api/news/source/:sourceName
 *
 * @param {Object} req - Express request object
 * @param {string} req.params.sourceName - Source name to filter by
 * @param {number} req.query.limit - Pagination limit (default: 10, max: 50)
 * @param {number} req.query.skip - Pagination offset (default: 0)
 * @param {Object} res - Express response object
 * @returns {Object} - { success, count, data: [news articles] }
 */
export const getNewsBySource = asyncHandler(async (req, res, next) => {
  const { sourceName } = req.params;

  // Validate source
  if (!VALID_SOURCES.includes(sourceName)) {
    throw new AppError(
      `Invalid source. Valid sources: ${VALID_SOURCES.join(", ")}`,
      400,
    );
  }

  const page = parsePagination(req.query, 50);

  const totalCount = await News.countDocuments({
    source: sourceName,
    isPublished: true,
  });

  const news = await News.find({ source: sourceName, isPublished: true })
    .sort({ date: -1 })
    .limit(page.limit)
    .skip(page.skip)
    .exec();

  const publicNews = news.map((article) => article.getPublicNews());

  res.status(200).json({
    success: true,
    message: `Found ${news.length} articles from ${sourceName}`,
    pagination: paginationOf(totalCount, page),
    data: publicNews,
  });
});

/**
 * Search news by headline or summary
 * GET /api/news/search?q=keyword
 *
 * @param {Object} req - Express request object
 * @param {string} req.query.q - Search query (required, min 3 chars)
 * @param {number} req.query.limit - Pagination limit (default: 10, max: 50)
 * @param {Object} res - Express response object
 * @returns {Object} - { success, count, data: [news articles] }
 */
export const searchNews = asyncHandler(async (req, res, next) => {
  const { q } = req.query;

  if (!q || q.trim().length < 3) {
    throw new AppError("Search query must be at least 3 characters", 400);
  }

  const page = parsePagination(req.query, 50);

  const filter = { $text: { $search: q }, isPublished: true };

  const [news, totalCount] = await Promise.all([
    News.find(
      filter,
      { score: { $meta: "textScore" } },
    )
      .sort({ score: { $meta: "textScore" }, date: -1 })
      .skip(page.skip)
      .limit(page.limit)
      .exec(),
    News.countDocuments(filter),
  ]);

  const publicNews = news.map((article) => article.getPublicNews());

  res.status(200).json({
    success: true,
    message: `Found ${news.length} articles matching: "${q}"`,
    pagination: paginationOf(totalCount, page),
    data: publicNews,
  });
});

/**
 * Get statistics about news
 * GET /api/news/stats/overview
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - { success, data: stats }
 */
export const getNewsStats = asyncHandler(async (req, res, next) => {
  const today = todayFilter();
  const totalNews = await News.countDocuments({ isPublished: true });
  const todayNews = await News.countDocuments(today);

  // Today's detailed summaries: how many readers have opened, and which
  // free-tier models wrote them.
  const detailedRows = await News.aggregate([
    { $match: today },
    {
      $group: {
        _id: { status: "$detailedStatus", model: "$modelUsed" },
        count: { $sum: 1 },
      },
    },
  ]);
  const detailed = { byStatus: {}, byModel: {} };
  for (const { _id, count } of detailedRows) {
    const status = _id.status || "NONE";
    detailed.byStatus[status] = (detailed.byStatus[status] || 0) + count;
    if (status === "DONE") {
      const model = _id.model || "unknown";
      detailed.byModel[model] = (detailed.byModel[model] || 0) + count;
    }
  }

  const sourceStats = await News.aggregate([
    { $match: { isPublished: true } },
    {
      $group: {
        _id: "$source",
        count: { $sum: 1 },
      },
    },
  ]);

  const tagStats = await News.aggregate([
    { $match: { isPublished: true } },
    { $unwind: "$tags" },
    {
      $group: {
        _id: "$tags",
        count: { $sum: 1 },
      },
    },
  ]);

  const categoryStats = await News.aggregate([
    { $match: { isPublished: true } },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalArticles: totalNews,
      todayArticles: todayNews,
      bySource: sourceStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      byTag: tagStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      byCategory: NEWS_CATEGORIES.reduce((acc, category) => {
        const row = categoryStats.find((s) => s._id === category);
        acc[category] = row ? row.count : 0;
        return acc;
      }, {}),
      detailed,
    },
  });
});
