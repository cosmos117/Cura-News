import mongoose from "mongoose";

/**
 * Quiz Schema - Embedded in News
 * Represents a quiz question for an article
 */
const quizSchema = new mongoose.Schema({
  question: {
    type: String,
    required: [true, "Please provide a quiz question"],
    trim: true,
    minlength: [10, "Question must be at least 10 characters"],
  },
  options: {
    type: [String],
    required: [true, "Please provide quiz options"],
    validate: {
      validator: function (options) {
        return options && options.length === 4;
      },
      message: "Quiz must have exactly 4 options",
    },
  },
  answer: {
    type: String,
    required: [true, "Please provide the correct answer"],
    enum: ["A", "B", "C", "D"],
  },
});

/**
 * News Schema
 * Represents a news article with AI-generated summaries, metadata, and quizzes
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
    bulletPoints: {
      type: [String],
      required: [true, "Please provide bullet points"],
      validate: {
        validator: function (points) {
          return points && points.length >= 3 && points.length <= 10;
        },
        message: "Must have between 3 and 10 bullet points",
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
    subtopics: {
      type: [String],
      validate: {
        validator: function (subtopics) {
          return !subtopics || subtopics.length <= 5;
        },
        message: "Cannot have more than 5 subtopics",
      },
    },
    quiz: {
      type: [quizSchema],
      validate: {
        validator: function (quiz) {
          return !quiz || (quiz.length >= 3 && quiz.length <= 5);
        },
        message: "Must have between 3 and 5 quiz questions",
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
 * Index for full-text search on headline and summary
 */
newsSchema.index({ headline: "text", summary: "text" });

/**
 * Instance method: Get news with safe quiz (hides answers)
 * @returns {Object} - News object with quiz answers hidden
 */
newsSchema.methods.getPublicNews = function () {
  const news = this.toObject();
  if (news.quiz) {
    news.quiz = news.quiz.map((q) => ({
      question: q.question,
      options: q.options,
    }));
  }
  return news;
};

/**
 * Instance method: Get news with quiz answers visible (for admin/teacher)
 * @returns {Object} - News object with complete quiz info
 */
newsSchema.methods.getAdminNews = function () {
  return this.toObject();
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
 */
newsSchema.query.today = function () {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  return this.where({
    date: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });
};

const News = mongoose.model("News", newsSchema);

export default News;
