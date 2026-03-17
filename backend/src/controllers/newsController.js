import News from "../models/News.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";

/**
 * Get today's news with optional tag filtering
 * GET /api/news/today?tag=Polity
 *
 * @param {Object} req - Express request object
 * @param {string} req.query.tag - Optional: filter by single tag
 * @param {string} req.query.tags - Optional: filter by multiple tags (comma-separated)
 * @param {string} req.query.source - Optional: filter by source
 * @param {number} req.query.limit - Optional: number of results (default: 10, max: 50)
 * @param {number} req.query.skip - Optional: pagination offset (default: 0)
 * @param {Object} res - Express response object
 * @returns {Object} - { success, message, count, data: [news articles] }
 */
export const getTodayNews = asyncHandler(async (req, res, next) => {
  const { tag, tags, source, limit = 10, skip = 0 } = req.query;

  // Validate and sanitize limit
  const parsedLimit = Math.min(parseInt(limit) || 10, 50);
  const parsedSkip = Math.max(parseInt(skip) || 0, 0);

  // Build filter query
  let query = News.find({ isPublished: true }).today().sort({ date: -1 });

  // Filter by single tag
  if (tag) {
    query = query.where({ tags: tag });
  }

  // Filter by multiple tags (OR condition)
  if (tags) {
    const tagArray = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tagArray.length > 0) {
      query = query.where({ tags: { $in: tagArray } });
    }
  }

  // Filter by source
  if (source) {
    const validSources = ["The Hindu", "Indian Express", "Times of India"];
    if (!validSources.includes(source)) {
      throw new AppError(
        "Invalid source. Must be: The Hindu, Indian Express, or Times of India",
        400,
      );
    }
    query = query.where({ source });
  }

  // Get total count for pagination
  const totalCount = await News.countDocuments(query);

  // Execute query with pagination
  const news = await query.limit(parsedLimit).skip(parsedSkip).exec();

  // Hide quiz answers from public
  const publicNews = news.map((article) => article.getPublicNews());

  res.status(200).json({
    success: true,
    message: `Found ${news.length} news articles for today`,
    pagination: {
      total: totalCount,
      limit: parsedLimit,
      skip: parsedSkip,
      hasMore: totalCount > parsedSkip + parsedLimit,
    },
    data: publicNews,
  });
});

/**
 * Get a single news article by ID
 * GET /api/news/:id
 *
 * @param {Object} req - Express request object
 * @param {string} req.params.id - News article ID
 * @param {string} req.query.includeAnswers - Optional: "true" to include quiz answers (requires admin)
 * @param {Object} res - Express response object
 * @returns {Object} - { success, data: news article }
 */
export const getNewsByID = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { includeAnswers } = req.query;

  // Validate ID format
  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    throw new AppError("Invalid news ID format", 400);
  }

  // Find news article
  const news = await News.findById(id);

  if (!news) {
    throw new AppError("News article not found", 404);
  }

  if (!news.isPublished) {
    throw new AppError("This article is not published", 404);
  }

  // Return based on query parameter
  const newsData =
    includeAnswers === "true" ? news.getAdminNews() : news.getPublicNews();

  res.status(200).json({
    success: true,
    message: "News article retrieved successfully",
    data: newsData,
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
 * @param {string[]} req.body.subtopics - Subtopics (optional, max 5)
 * @param {Object[]} req.body.quiz - Quiz questions (optional, 3-5)
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
    tags,
    subtopics,
    quiz,
    url,
  } = req.body;

  // Validate required fields
  if (!source || !headline || !summary || !bulletPoints || !tags) {
    throw new AppError(
      "Please provide: source, headline, summary, bulletPoints, and tags",
      400,
    );
  }

  // Validate source enum
  const validSources = ["The Hindu", "Indian Express", "Times of India"];
  if (!validSources.includes(source)) {
    throw new AppError(
      "Source must be one of: The Hindu, Indian Express, Times of India",
      400,
    );
  }

  // Validate tags enum
  const validTags = [
    "Polity",
    "Economy",
    "Defense",
    "Science",
    "International",
  ];
  const tagsArray = Array.isArray(tags) ? tags : [tags];
  const invalidTags = tagsArray.filter((tag) => !validTags.includes(tag));

  if (invalidTags.length > 0) {
    throw new AppError(
      `Invalid tags: ${invalidTags.join(", ")}. Valid tags: ${validTags.join(", ")}`,
      400,
    );
  }

  // Validate bullet points count
  const bulletPointsArray = Array.isArray(bulletPoints)
    ? bulletPoints
    : [bulletPoints];
  if (bulletPointsArray.length < 3 || bulletPointsArray.length > 10) {
    throw new AppError("Must provide between 3 and 10 bullet points", 400);
  }

  // Validate tags count
  if (tagsArray.length < 1 || tagsArray.length > 3) {
    throw new AppError("Must have between 1 and 3 tags", 400);
  }

  // Validate quiz format if provided
  if (quiz && Array.isArray(quiz)) {
    if (quiz.length < 3 || quiz.length > 5) {
      throw new AppError("Must have between 3 and 5 quiz questions", 400);
    }

    for (let i = 0; i < quiz.length; i++) {
      const q = quiz[i];
      if (
        !q.question ||
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        !q.answer
      ) {
        throw new AppError(
          `Quiz question ${i + 1} is invalid. Each question must have: question (string), options (4 strings), answer (A-D)`,
          400,
        );
      }

      if (!["A", "B", "C", "D"].includes(q.answer)) {
        throw new AppError(
          `Quiz question ${i + 1}: answer must be A, B, C, or D`,
          400,
        );
      }
    }
  }

  // Create news article
  const newsArticle = new News({
    source,
    date: date ? new Date(date) : new Date(),
    headline,
    summary,
    bulletPoints: bulletPointsArray,
    tags: tagsArray,
    subtopics: subtopics || [],
    quiz: quiz || [],
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
  const { limit = 10, skip = 0 } = req.query;

  // Validate tag
  const validTags = [
    "Polity",
    "Economy",
    "Defense",
    "Science",
    "International",
  ];
  if (!validTags.includes(tagName)) {
    throw new AppError(`Invalid tag. Valid tags: ${validTags.join(", ")}`, 400);
  }

  const parsedLimit = Math.min(parseInt(limit) || 10, 50);
  const parsedSkip = Math.max(parseInt(skip) || 0, 0);

  const totalCount = await News.countDocuments({
    tags: tagName,
    isPublished: true,
  });

  const news = await News.find({ tags: tagName, isPublished: true })
    .sort({ date: -1 })
    .limit(parsedLimit)
    .skip(parsedSkip)
    .exec();

  const publicNews = news.map((article) => article.getPublicNews());

  res.status(200).json({
    success: true,
    message: `Found ${news.length} articles with tag: ${tagName}`,
    pagination: {
      total: totalCount,
      limit: parsedLimit,
      skip: parsedSkip,
      hasMore: totalCount > parsedSkip + parsedLimit,
    },
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
  const { limit = 10, skip = 0 } = req.query;

  // Validate source
  const validSources = ["The Hindu", "Indian Express", "Times of India"];
  if (!validSources.includes(sourceName)) {
    throw new AppError(
      `Invalid source. Valid sources: ${validSources.join(", ")}`,
      400,
    );
  }

  const parsedLimit = Math.min(parseInt(limit) || 10, 50);
  const parsedSkip = Math.max(parseInt(skip) || 0, 0);

  const totalCount = await News.countDocuments({
    source: sourceName,
    isPublished: true,
  });

  const news = await News.find({ source: sourceName, isPublished: true })
    .sort({ date: -1 })
    .limit(parsedLimit)
    .skip(parsedSkip)
    .exec();

  const publicNews = news.map((article) => article.getPublicNews());

  res.status(200).json({
    success: true,
    message: `Found ${news.length} articles from ${sourceName}`,
    pagination: {
      total: totalCount,
      limit: parsedLimit,
      skip: parsedSkip,
      hasMore: totalCount > parsedSkip + parsedLimit,
    },
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
  const { q, limit = 10 } = req.query;

  if (!q || q.trim().length < 3) {
    throw new AppError("Search query must be at least 3 characters", 400);
  }

  const parsedLimit = Math.min(parseInt(limit) || 10, 50);

  const news = await News.find(
    { $text: { $search: q }, isPublished: true },
    { score: { $meta: "textScore" } },
  )
    .sort({ score: { $meta: "textScore" }, date: -1 })
    .limit(parsedLimit)
    .exec();

  const publicNews = news.map((article) => article.getPublicNews());

  res.status(200).json({
    success: true,
    message: `Found ${news.length} articles matching: "${q}"`,
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
  const totalNews = await News.countDocuments({ isPublished: true });
  const todayNews = await News.countDocuments({
    isPublished: true,
    date: {
      $gte: new Date(new Date().setHours(0, 0, 0, 0)),
    },
  });

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
    },
  });
});

/**
 * Fetch and process daily news from NewsAPI
 * Runs the complete pipeline: fetch → filter → summarize → store
 * GET /api/news/fetch-daily
 *
 * @param {Object} req - Express request object
 * @param {string} req.query.skipAIFilter - Optional: "true" to use keyword filter only (faster)
 * @param {Object} res - Express response object
 * @returns {Object} - Pipeline report with stats
 */
export const fetchDailyNews = asyncHandler(async (req, res, next) => {
  const { skipAIFilter } = req.query;

  res.status(200).json({
    success: true,
    message: "📡 Daily news pipeline started. Processing in background...",
    statusCode: 202,
    info: "Check /api/news/today after a few seconds to see new articles",
    estimatedTime:
      "30-60 seconds depending on API availability and article count",
  });

  // Run pipeline in background (don't wait)
  (async () => {
    try {
      // Import the news processor
      const newsProcessor = (await import("../services/newsProcessor.js"))
        .default;

      const report = await newsProcessor.processDailyNews({
        skipAIFilter: skipAIFilter === "true",
      });

      console.log("✅ Pipeline completed:", report);

      // Optional: Send report to admin via webhook or email
      // await notifyAdmin(report);
    } catch (error) {
      console.error("❌ Background pipeline error:", error.message);
      // Log to database or external service for monitoring
    }
  })();
});
