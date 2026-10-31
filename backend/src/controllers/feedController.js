import News from "../models/News.js";
import User from "../models/User.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { NEWS_CATEGORIES } from "../utils/category.js";
import { TOPICS, TOPIC_LABELS } from "../config/topics.js";
import {
  VALID_SOURCES,
  VALID_TAGS,
  buildArticleFilter,
  facetCounts,
  paginationOf,
  parseList,
  parsePagination,
  validateList,
} from "../utils/newsQuery.js";

const LEGACY_CATEGORY_ALIASES = {
  Politics: "Politics & Governance",
  Business: "Economy & Business",
  Tech: "Science & Technology",
  World: "World Affairs",
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
 * @param {number} [req.query.limit] - Optional: number of results (default: 10, max: 100)
 * @param {number} [req.query.skip] - Optional: pagination offset (default: 0)
 * @param {Object} res - Express response object
 * @returns {Object} - { success, pagination, facets, data: [news articles] }
 */
export const getTodayNews = asyncHandler((req, res) => sendFeed(req, res));

/**
 * The reader's personalised feed: today's news from the sources AND topics
 * they picked. The same query parameters as getTodayNews narrow it further.
 * GET /api/news/for-you
 *
 * Answers 409 when the reader has not picked yet, so the client can offer
 * the picker instead of an empty feed.
 */
export const getForYouNews = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId).select("preferences");
  const { sources = [], topics = [] } = user?.preferences || {};
  if (!sources.length || !topics.length) {
    throw new AppError("Pick your sources and topics to see your feed", 409);
  }

  return sendFeed(req, res, {
    sources: [...sources],
    categories: topics.map((id) => TOPIC_LABELS[id]).filter(Boolean),
  });
});

/**
 * Shared by both feeds. `scope`, when given, bounds the result to those
 * sources and categories: the card filters can narrow inside it, never
 * widen past it.
 */
const sendFeed = async (req, res, scope = null) => {
  const { tag, tags, category, topic, source, search } = req.query;
  const page = parsePagination(req.query, 100);

  const selectedTags = validateList(
    [...parseList(tags), ...parseList(tag)],
    VALID_TAGS,
    "tags",
  );
  const requestedCategories = parseList(category);
  const requestedTopics = parseList(topic).map(
    (value) => TOPICS.find((item) => item.id === value || item.label === value)?.label || value,
  );
  const selectedCategories = validateList(
    [...requestedTopics, ...requestedCategories].map(
      (value) => LEGACY_CATEGORY_ALIASES[value] || value,
    ),
    NEWS_CATEGORIES,
    "category",
  );
  const requestedSources = validateList(
    parseList(source),
    VALID_SOURCES,
    "source",
  );

  const withinScope = (selected, allowed) =>
    selected.length ? selected.filter((value) => allowed.includes(value)) : allowed;
  const categories = scope
    ? withinScope(selectedCategories, scope.categories)
    : selectedCategories;
  const selectedSources = scope
    ? withinScope(requestedSources, scope.sources)
    : requestedSources;

  const filter = buildArticleFilter({
    search,
    tags: selectedTags,
    categories,
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

  if (scope) {
    // Set explicitly: buildArticleFilter skips empty lists, but a card filter
    // outside the reader's picks must match nothing, not everything.
    filter.category = { $in: categories };
    filter.source = { $in: selectedSources };
    facetFilter.category = { $in: scope.categories };
    facetFilter.source = { $in: selectedSources };
  }

  const [totalCount, news, byCategory, bySource, byTag] = await Promise.all([
    News.countDocuments(filter),
    News.find(filter)
      .sort({ date: -1 })
      .limit(page.limit)
      .skip(page.skip)
      .exec(),
    facetCounts(facetFilter, "category"),
    facetCounts(facetFilter, "source"),
    facetCounts(facetFilter, "tags", true),
  ]);

  res.status(200).json({
    success: true,
    message: `Found ${news.length} news articles for today`,
    pagination: paginationOf(totalCount, page),
    // Every category is present, including zero-count ones, so the chip bar
    // does not reflow as filters change.
    facets: {
      byCategory: NEWS_CATEGORIES.reduce((acc, categoryName) => {
        acc[categoryName] = byCategory[categoryName] || 0;
        return acc;
      }, {}),
      bySource: Object.fromEntries(
        VALID_SOURCES.map((s) => [s, bySource[s] || 0]),
      ),
      byTag: Object.fromEntries(VALID_TAGS.map((t) => [t, byTag[t] || 0])),
    },
    data: news.map((article) => article.getPublicNews()),
  });
};
