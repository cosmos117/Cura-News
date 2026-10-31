/**
 * Query helpers shared by the news controllers: list parsing and validation,
 * pagination, and the Mongo filters behind today's feed.
 */

import News from "../models/News.js";
import { AppError } from "../middleware/errorHandler.js";
import { istDayKey, istDayRange } from "./date.js";

export { VALID_TAGS } from "../services/content/schema.js";
export const VALID_SOURCES = ["The Hindu", "Indian Express", "Times of India"];

/**
 * Split a comma-separated query value into a clean array.
 * @param {string|string[]} value
 * @returns {string[]}
 */
export const parseList = (value) => {
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
export const validateList = (values, allowed, label) => {
  const invalid = values.filter((v) => !allowed.includes(v));
  if (invalid.length > 0) {
    throw new AppError(
      `Invalid ${label}: ${invalid.join(", ")}. Valid values: ${allowed.join(", ")}`,
      400,
    );
  }
  return values;
};

/** Throw a 400 unless `id` looks like a Mongo ObjectId. */
export const assertArticleId = (id) => {
  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    throw new AppError("Invalid news ID format", 400);
  }
};

/**
 * Read `limit` and `skip` from a query, defaulting to 10 and 0.
 * @param {Object} query - req.query
 * @param {number} maxLimit
 * @returns {{ limit: number, skip: number }}
 */
export const parsePagination = ({ limit, skip } = {}, maxLimit) => ({
  limit: Math.min(parseInt(limit) || 10, maxLimit),
  skip: Math.max(parseInt(skip) || 0, 0),
});

/** The `pagination` block every list response carries. */
export const paginationOf = (total, { limit, skip }) => ({
  total,
  limit,
  skip,
  hasMore: total > skip + limit,
});

/**
 * Published articles from today (IST). Older rows without a day key fall back
 * to their publish time.
 */
export const todayFilter = () => ({
  isPublished: true,
  $or: [
    { publishedDayKey: istDayKey() },
    { publishedDayKey: { $exists: false }, publishedAt: istDayRange() },
  ],
});

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
 * @param {string[]} [options.topics]
 * @param {string[]} [options.sources]
 * @param {boolean} [options.includeCategory] - Set false to compute facet
 *   counts, so the topic cards keep showing the other categories' counts while
 *   one category is selected.
 * @returns {Object} - Mongo filter
 */
export const buildArticleFilter = ({
  search,
  tags = [],
  categories = [],
  topics = [],
  sources = [],
  includeCategory = true,
} = {}) => {
  const filter = todayFilter();

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
    filter.category = { $in: categories };
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
export const facetCounts = async (filter, field, unwind = false) => {
  const pipeline = [{ $match: filter }];
  if (unwind) pipeline.push({ $unwind: `$${field}` });
  pipeline.push({ $group: { _id: `$${field}`, count: { $sum: 1 } } });

  const rows = await News.aggregate(pipeline);
  return rows.reduce((acc, row) => {
    if (row._id) acc[row._id] = row.count;
    return acc;
  }, {});
};
