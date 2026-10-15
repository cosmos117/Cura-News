import mongoose from "mongoose";
import { utcDayRange } from "../utils/date.js";
import { NEWS_CATEGORIES, DEFAULT_CATEGORY } from "../utils/category.js";
import { TOPIC_IDS, TOPIC_LABELS } from "../config/topics.js";

const DETAILED_STATUSES = [
  "NONE",
  "PENDING",
  "DONE",
  "FAILED",
  "UNAVAILABLE",
];
const DETAIL_SOURCE_TYPES = ["FULL_TEXT", "SNIPPET_ONLY"];

/**
 * News Schema
 * Represents a news article with AI-generated summaries and metadata
 */
const newsSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: [true, "Please provide a news source"],
      enum: {
        values: ["The Hindu", "Indian Express", "Times of India"],
        message:
          "Source must be one of: The Hindu, Indian Express, Times of India",
      },
    },
    date: {
      type: Date,
      required: [true, "Please provide a date"],
      default: Date.now,
      index: true, // Index for fast date queries
    },
    publishedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    section: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    sourceId: {
      type: String,
      trim: true,
    },
    feedId: {
      type: String,
      trim: true,
    },
    summaryStatus: {
      type: String,
      enum: ["PENDING", "SUMMARIZED", "FAILED", "SKIPPED"],
      default: "SUMMARIZED",
    },
    summaryAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastError: {
      type: String,
      maxlength: 500,
    },
    summarizedAt: {
      type: Date,
    },
    modelUsed: {
      type: String,
    },
    headline: {
      type: String,
      required: [true, "Please provide a headline"],
      trim: true,
      minlength: [10, "Headline must be at least 10 characters"],
      maxlength: [200, "Headline cannot exceed 200 characters"],
    },
    summary: {
      type: String,
      required: [true, "Please provide a summary"],
      trim: true,
      minlength: [50, "Summary must be at least 50 characters"],
      maxlength: [1000, "Summary cannot exceed 1000 characters"],
    },
    gist: {
      type: String,
      trim: true,
      maxlength: [220, "Gist cannot exceed 220 characters"],
      default: "",
    },
    keyFacts: {
      type: [String],
      default: [],
      validate: {
        validator: (facts) => Array.isArray(facts) && facts.length <= 5,
        message: "Cannot have more than 5 key facts",
      },
    },
    detailedSummary: {
      type: String,
      trim: true,
      default: null,
    },
    detailedStatus: {
      type: String,
      enum: DETAILED_STATUSES,
      default: "NONE",
      index: true,
    },
    detailedGeneratedAt: {
      type: Date,
      default: null,
    },
    detailedConfidence: {
      type: String,
      enum: ["high", "medium", "low"],
    },
    detailSourceType: {
      type: String,
      enum: DETAIL_SOURCE_TYPES,
    },
    bulletPoints: {
      type: [String],
      required: [true, "Please provide bullet points"],
      validate: {
        validator: function (points) {
          return Array.isArray(points) && points.length <= 5;
        },
        message: "Must have between 0 and 5 key facts",
      },
    },
    tags: {
      type: [String],
      required: [true, "Please provide tags"],
      enum: {
        values: ["Polity", "Economy", "Defense", "Science", "International"],
        message:
          "Tags must be one of: Polity, Economy, Defense, Science, International",
      },
      index: true, // Index for fast tag queries
      validate: {
        validator: function (tags) {
          return tags && tags.length >= 1 && tags.length <= 3;
        },
        message: "Must have between 1 and 3 tags",
      },
    },
    /**
     * Primary topic classification.
     *
     * These four fields MUST be declared at the top level of the schema, not
     * nested inside the `tags` definition above. `tags` is `type: [String]`, so
     * Mongoose reads that whole object literal as the array's type definition
     * and silently discards any sibling keys. With the fields nested there,
     * `topic` was never a real path on the model: every write dropped it and
     * every `topic` facet query counted null, which is why the dashboard's
     * topic cards stayed at 0 no matter how many articles were ingested.
     */
    topic: {
      type: String,
      // `null` is an explicit enum member: "classified but unmatched". Mongoose
      // runs enum validation against the default value, so leaving it out makes
      // every article that has not been classified fail validation outright
      // instead of storing as unclassified.
      enum: [...TOPIC_IDS, null],
      index: true,
      default: null,
    },
    secondaryTopics: {
      type: [String],
      enum: TOPIC_IDS,
      default: [],
      validate: {
        validator: (topics) => topics.length <= 2,
        message: "Cannot have more than 2 secondary topics",
      },
    },
    topicSource: {
      type: String,
      enum: ["SECTION", "KEYWORD", "AI", "MANUAL"],
    },
    topicConfidence: {
      type: String,
      enum: ["high", "medium", "low"],
    },
    /**
     * Broad news category, used for the topic cards and category chip bar.
     *
     * Deliberately separate from `tags`, which is the general topic view
     * (Polity/Economy/Defense/Science/International). An article can be
     * category "Tech" and tagged "Science" at the same time, and collapsing
     * the two vocabularies would break the topic tagging.
     *
     * Defaults to "Other" rather than being required so that pre-existing
     * documents and manual POST /news calls without a category still store.
     */
    category: {
      type: String,
      enum: {
        values: NEWS_CATEGORIES,
        message: `Category must be one of: ${NEWS_CATEGORIES.join(", ")}`,
      },
      default: DEFAULT_CATEGORY,
      index: true,
    },
    subtopics: {
      type: [String],
      validate: {
        validator: function (subtopics) {
          return !subtopics || subtopics.length <= 5;
        },
        message: "Cannot have more than 5 subtopics",
      },
    },
    url: {
      type: String,
      validate: {
        validator: function (url) {
          return !url || /^https?:\/\/.+/.test(url);
        },
        message: "Please provide a valid URL",
      },
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  },
);

/**
 * Index for querying by date descending (recent news first)
 */
newsSchema.index({ date: -1 });

/**
 * Index for querying by tags with date
 */
newsSchema.index({ tags: 1, date: -1 });

/**
 * Index for category queries combined with the day window
 */
newsSchema.index({ category: 1, date: -1 });
newsSchema.index({ topic: 1, date: -1 });

/**
 * Index for selecting recent articles by detailed-summary state.
 */
newsSchema.index({ date: -1, detailedStatus: 1 });

/**
 * Index for full-text search on headline and summary
 */
newsSchema.index({ headline: "text", summary: "text" });

/**
 * Instance method: Get news as a plain public object
 * @returns {Object} - News object
 */
newsSchema.methods.getPublicNews = function () {
  const data = this.toObject();
  return {
    ...data,
    topicLabel: TOPIC_LABELS[data.topic] || data.category || "Other",
  };
};

/**
 * Query helper: Only get published news
 */
newsSchema.query.published = function () {
  return this.where({ isPublished: true });
};

/**
 * Query helper: Filter by tags
 */
newsSchema.query.byTags = function (tags) {
  if (!tags || tags.length === 0) return this;
  return this.where({ tags: { $in: tags } });
};

/**
 * Query helper: Filter by one or more categories
 */
newsSchema.query.byCategory = function (categories) {
  if (!categories || categories.length === 0) return this;
  return this.where({ category: { $in: categories } });
};

/**
 * Query helper: Filter by date range
 */
newsSchema.query.byDateRange = function (startDate, endDate) {
  if (!startDate || !endDate) return this;
  return this.where({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  });
};

/**
 * Query helper: Only get today's news
 *
 * Uses UTC boundaries to match the UTC timestamps from NewsAPI. Server-local
 * midnight shifted the window on any non-UTC deployment.
 */
newsSchema.query.today = function () {
  const now = new Date();
  return this.where({ date: utcDayRange(now) });
};

const News = mongoose.model("News", newsSchema);

export default News;
