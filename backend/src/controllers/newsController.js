import News from "../models/News.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { utcDayRange } from "../utils/date.js";
import { NEWS_CATEGORIES } from "../utils/category.js";
import { TOPICS } from "../config/topics.js";
import {
  dailyDetailedCount,
  generateDetailedSummary,
  detailedConfig,
} from "../services/detailedSummaryService.js";

const VALID_SOURCES = ["The Hindu", "Indian Express", "Times of India"];
const VALID_TAGS = [
  "Polity",
  "Economy",
  "Defense",
  "Science",
  "International",
];
const VALID_TOPIC_VALUES = TOPICS.flatMap((topic) => [topic.id, topic.label]);

/**
 * Split a comma-separated query value into a clean array.
 * @param {string|string[]} value
 * @returns {string[]}
 */
const parseList = (value) => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

/**
 * Validate a list against an allowed set, rejecting rather than silently
 * dropping unknown values. Silently ignoring them makes a typo look exactly
 * like "no articles matched", which is indistinguishable from an empty result.
 * @param {string[]} values
 * @param {string[]} allowed
 * @param {string} label
 * @returns {string[]}
 */
const validateList = (values, allowed, label) => {
  const invalid = values.filter((v) => !allowed.includes(v));
  if (invalid.length > 0) {
    throw new AppError(
      `Invalid ${label}: ${invalid.join(", ")}. Valid values: ${allowed.join(", ")}`,
      400,
    );
  }
  return values;
};

/**
 * Build the Mongo filter for the article list.
 *
 * Every filter dimension is applied here in one place, which is what makes
 * search + category + source + tags combine as an AND rather than each filter
 * overwriting the last.
 *
 * @param {Object} options
 * @param {string} [options.search] - Full-text term (min 3 chars)
 * @param {string[]} [options.tags]
 * @param {string[]} [options.categories]
 * @param {string[]} [options.sources]
 * @param {boolean} [options.includeCategory] - Set false to compute facet
 *   counts, so the topic cards keep showing the other categories' counts while
 *   one category is selected.
 * @returns {Object} - Mongo filter
 */
const buildArticleFilter = ({
  search,
  tags = [],
  categories = [],
  legacyCategories = [],
  topics = [],
  sources = [],
  includeCategory = true,
} = {}) => {
  const filter = {
    isPublished: true,
    date: utcDayRange(),
  };

  const term = search?.trim();
  if (term) {
    if (term.length < 3) {
      throw new AppError("Search query must be at least 3 characters", 400);
    }
    filter.$text = { $search: term };
  }

  if (tags.length > 0) {
    filter.tags = { $in: tags };
  }

  if (includeCategory && categories.length > 0) {
    filter.topic = { $in: categories };
  }
  if (includeCategory && legacyCategories.length > 0) {
    filter.category = { $in: legacyCategories };
  }
  if (topics.length > 0) {
    filter.topic = { $in: topics };
  }

  if (sources.length > 0) {
    filter.source = { $in: sources };
  }

  return filter;
};

/**
 * Count articles per value for one field, over the given filter.
 * @param {Object} filter - Base Mongo filter
 * @param {string} field - Field to group by
 * @param {boolean} [unwind] - Unwind an array field (tags) before grouping
 * @returns {Promise<Object>} - { value: count }
 */
const facetCounts = async (filter, field, unwind = false) => {
  const pipeline = [{ $match: filter }];
  if (unwind) pipeline.push({ $unwind: `$${field}` });
  pipeline.push({ $group: { _id: `$${field}`, count: { $sum: 1 } } });

  const rows = await News.aggregate(pipeline);
  return rows.reduce((acc, row) => {
    if (row._id) acc[row._id] = row.count;
    return acc;
  }, {});
};

/**
 * Get today's news with combined filtering
 * GET /api/news/today?search=parliament&category=Politics&source=The%20Hindu
 *
 * All parameters are optional and are ANDed together, so search + category +
 * source + tags narrow the result set together.
 *
 * @param {Object} req - Express request object
 * @param {string} [req.query.search] - Full-text search (min 3 chars)
 * @param {string} [req.query.tag] - Optional: single tag (legacy alias)
 * @param {string} [req.query.tags] - Optional: comma-separated tags
 * @param {string} [req.query.category] - Optional: comma-separated categories
 * @param {string} [req.query.source] - Optional: comma-separated sources
 * @param {number} [req.query.limit] - Optional: number of results (default: 10, max: 50)
 * @param {number} [req.query.skip] - Optional: pagination offset (default: 0)
 * @param {Object} res - Express response object
 * @returns {Object} - { success, pagination, facets, data: [news articles] }
 */
export const getTodayNews = asyncHandler(async (req, res, next) => {
  const { tag, tags, category, topic, source, search, limit = 10, skip = 0 } = req.query;

  // Validate and sanitize limit
  const parsedLimit = Math.min(parseInt(limit) || 10, 100);
  const parsedSkip = Math.max(parseInt(skip) || 0, 0);

  const selectedTags = validateList(
    [...parseList(tags), ...parseList(tag)],
    VALID_TAGS,
    "tags",
  );
  const requestedCategories = parseList(category);
  const requestedTopics = parseList(topic);
  const selectedCategories = validateList(
    [...requestedTopics, ...requestedCategories.filter((value) => VALID_TOPIC_VALUES.includes(value))],
    VALID_TOPIC_VALUES,
    "topic",
  )
    .map((value) => TOPICS.find((item) => item.id === value || item.label === value).id);
  const legacyCategories = validateList(
    requestedCategories.filter((value) => !VALID_TOPIC_VALUES.includes(value)),
    NEWS_CATEGORIES,
    "category",
  );
  const selectedSources = validateList(
    parseList(source),
    VALID_SOURCES,
    "source",
  );

  const filter = buildArticleFilter({
    search,
    tags: selectedTags,
    categories: selectedCategories,
    legacyCategories,
    sources: selectedSources,
  });

  // Facet counts come from the same filter MINUS the category constraint, so
  // every topic card still shows what it would yield if selected.
  const facetFilter = buildArticleFilter({
    search,
    tags: selectedTags,
    sources: selectedSources,
    includeCategory: false,
  });

  const [totalCount, news, byCategory, byLegacyCategory, bySource, byTag] = await Promise.all([
    News.countDocuments(filter),
    News.find(filter).sort({ date: -1 }).limit(parsedLimit).skip(parsedSkip).exec(),
    facetCounts(facetFilter, "topic"),
    facetCounts(facetFilter, "category"),
    facetCounts(facetFilter, "source"),
    facetCounts(facetFilter, "tags", true),
  ]);

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
    // Every category is present, including zero-count ones, so the chip bar
    // does not reflow as filters change.
    facets: {
      byCategory: [...TOPICS.map((topicItem) => [topicItem.label, byCategory[topicItem.id] || 0]),
        ...NEWS_CATEGORIES.map((categoryName) => [categoryName, byLegacyCategory[categoryName] || 0])]
        .reduce((acc, [label, count]) => ({ ...acc, [label]: Math.max(acc[label] || 0, count) }), {}),
      bySource: Object.fromEntries(
        VALID_SOURCES.map((s) => [s, bySource[s] || 0]),
      ),
      byTag: Object.fromEntries(VALID_TAGS.map((t) => [t, byTag[t] || 0])),
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
 * @param {Object} res - Express response object
 * @returns {Object} - { success, data: news article }
 */
export const getNewsByID = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

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

  // Quiz answers are always stripped. `?includeAnswers=true` used to bypass
  // this with no authentication at all, handing the answer key for every
  // article to any anonymous caller.
  res.status(200).json({
    success: true,
    message: "News article retrieved successfully",
    data: news.getPublicNews(),
  });
});

/**
 * Generate or return the cached detailed summary for an article.
 * POST /api/news/:id/detailed
 */
export const generateDetailedNews = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new AppError("Invalid news ID format", 400);
    }

    const article = await News.findOne({ _id: id, isPublished: true });
    if (!article) throw new AppError("News article not found", 404);

    if (article.detailedStatus === "DONE" && article.detailedSummary) {
      return res.status(200).json({
        success: true,
        message: "Detailed summary retrieved from cache",
        data: article.getPublicNews(),
      });
    }

    if (article.detailedStatus === "PENDING") {
      return res.status(202).json({
        success: true,
        message: "Generating detailed summary...",
        data: article.getPublicNews(),
      });
    }

    const generatedToday = await dailyDetailedCount();
    if (generatedToday >= detailedConfig.AI_DAILY_LIMIT) {
      return res.status(429).json({
        success: false,
        message: "Detailed summary will be available soon",
      });
    }

    const locked = await News.findOneAndUpdate(
      {
        _id: id,
        isPublished: true,
        detailedStatus: { $in: ["NONE", "FAILED", "UNAVAILABLE"] },
      },
      { $set: { detailedStatus: "PENDING" } },
      { new: true },
    );

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
      result = await generateDetailedSummary(locked);
    } catch (error) {
      console.error("Detailed summary generation failed:", {
        articleId: id,
        message: error.message,
      });

      const failed = await News.findByIdAndUpdate(
        id,
        {
          $set: {
            detailedStatus: "FAILED",
            detailSourceType: "SNIPPET_ONLY",
            lastError: "Detailed summary generation failed",
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
    const update = {
      detailedStatus: result.status,
      detailSourceType: result.detailSourceType,
    };

    if (result.status === "DONE") {
      update.headline = result.heading;
      update.detailedSummary = result.detailedSummary;
      update.detailedConfidence = result.confidence;
      update.detailedGeneratedAt = new Date();
      update.category = result.category;
      update.tags = result.syllabusTags.length
        ? result.syllabusTags
        : locked.tags;
      update.$unset = {
        lastError: 1,
      };
    } else if (result.status === "FAILED") {
      update.detailedSummary = undefined;
      update.lastError = (
        result.reason || "Detailed summary generation failed"
      ).slice(0, 500);
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
          },
        },
        { new: true, runValidators: true },
      );

      if (!saved) throw new AppError("News article not found", 404);
      return res.status(422).json({
        success: false,
        message: "Detailed summary could not be saved. Please try again.",
        data: saved.getPublicNews(),
      });
    }
    if (!saved) throw new AppError("News article not found", 404);

    return res.status(result.status === "DONE" ? 200 : 422).json({
      success: result.status !== "FAILED",
      message:
        result.status === "DONE"
          ? "Detailed summary generated"
          : result.status === "UNAVAILABLE"
            ? "Detailed summary is unavailable. Read the full story at the source."
            : "Detailed summary generation failed. Please try again.",
      data: saved.getPublicNews(),
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
 *   "Other"). One of Politics, Business, Sports, Tech, World, Entertainment,
 *   Other
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
    category,
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
  if (!VALID_SOURCES.includes(source)) {
    throw new AppError(
      `Source must be one of: ${VALID_SOURCES.join(", ")}`,
      400,
    );
  }

  // Validate category enum when supplied. Optional: an omitted category falls
  // back to "Other" so manual creation does not require the caller to know the
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
    category,
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
  const { limit = 10, skip = 0 } = req.query;

  // Validate tag
  if (!VALID_TAGS.includes(tagName)) {
    throw new AppError(
      `Invalid tag. Valid tags: ${VALID_TAGS.join(", ")}`,
      400,
    );
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
  if (!VALID_SOURCES.includes(sourceName)) {
    throw new AppError(
      `Invalid source. Valid sources: ${VALID_SOURCES.join(", ")}`,
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
  const { q, limit = 10, skip = 0 } = req.query;

  if (!q || q.trim().length < 3) {
    throw new AppError("Search query must be at least 3 characters", 400);
  }

  const parsedLimit = Math.min(parseInt(limit) || 10, 50);
  const parsedSkip = Math.max(parseInt(skip) || 0, 0);

  const filter = { $text: { $search: q }, isPublished: true };

  const [news, totalCount] = await Promise.all([
    News.find(
      filter,
      { score: { $meta: "textScore" } },
    )
      .sort({ score: { $meta: "textScore" }, date: -1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .exec(),
    News.countDocuments(filter),
  ]);

  const publicNews = news.map((article) => article.getPublicNews());

  res.status(200).json({
    success: true,
    message: `Found ${news.length} articles matching: "${q}"`,
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
    date: utcDayRange(),
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
    },
  });
});

/**
 * Fetch and process daily news from NewsAPI
 * Runs the complete pipeline: fetch → dedupe → filter → summarize → store
 * GET /api/news/fetch-daily
 *
 * Protected and rate limited at the route level. Returns 202 immediately and
 * runs the pipeline in the background; the processor holds an in-flight lock
 * so a second request cannot start an overlapping run.
 *
 * @param {Object} req - Express request object
 * @param {string} req.query.skipAIFilter - Optional: "true" to use keyword
 *   filter only (cheaper, less precise)
 * @param {Object} res - Express response object
 */
export const fetchDailyNews = asyncHandler(async (req, res, next) => {
  const { skipAIFilter } = req.query;

  res.status(202).json({
    success: true,
    message: "📡 Daily news pipeline started. Processing in background...",
    info: "Check /api/news/today after a few seconds to see new articles",
    estimatedTime:
      "30-60 seconds depending on API availability and article count",
  });

  // Run pipeline in background (don't block the response). The promise is
  // tracked on the singleton so graceful shutdown and overlap detection can
  // see it.
  (async () => {
    try {
      const newsProcessor = (await import("../services/newsProcessor.js"))
        .default;

      const report = await newsProcessor.processDailyNews({
        skipAIFilter: skipAIFilter === "true",
      });

      if (report.alreadyRunning) {
        console.log("ℹ️  Pipeline request ignored - a run is already in progress");
        return;
      }

      console.log("✅ Pipeline completed:", report);
    } catch (error) {
      console.error("❌ Background pipeline error:", error.message);
    }
  })();
});
