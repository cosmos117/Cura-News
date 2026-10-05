/**
 * News Processor Service
 * Orchestrates the complete news processing pipeline:
 * 1. Fetch articles from RSS feeds
 * 2. Filter by relevance (AI or keywords)
 * 3. Create a rule-based short summary
 * 4. Store in MongoDB
 * 5. Handle failures and deduplication
 */

import News from "../models/News.js";
import { fetchRssArticles } from "./rssFetcher.js";
import { resolveCategory } from "../utils/category.js";
import { generateTopDetailedSummaries } from "./detailedSummaryService.js";
import { classifyArticles } from "./topicClassifier.js";

/**
 * Keys that aiService.summarizeArticle adds for its own bookkeeping. These must
 * never be forwarded to News.create - `source` in particular would overwrite
 * the real publisher and fail the model enum.
 */
const AI_ONLY_KEYS = ["source", "processedAt"];

/**
 * Pipeline configuration
 */
const PIPELINE_CONFIG = {
  BATCH_SIZE: 5, // Process 5 articles at a time
  RETRY_ATTEMPTS: 3, // total attempts per AI call (1 initial + 2 retries)
  RETRY_DELAY: 2000, // 2 seconds
};

/**
 * Pipeline logger
 */
class PipelineLogger {
  constructor() {
    this.logs = [];
    this.stats = {
      fetched: 0,
      filtered: 0,
      summarized: 0,
      stored: 0,
      failed: 0,
      duplicates: 0,
      startTime: null,
      endTime: null,
    };
  }

  log(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };
    this.logs.push(entry);
    console.log(`[${level}] ${message}`, data);
  }

  info(message, data) {
    this.log("INFO", message, data);
  }

  warn(message, data) {
    this.log("WARN", message, data);
  }

  error(message, data) {
    this.log("ERROR", message, data);
  }

  getReport() {
    const duration = this.stats.endTime
      ? (this.stats.endTime - this.stats.startTime) / 1000
      : 0;

    return {
      timestamp: new Date().toISOString(),
      duration: `${duration.toFixed(2)}s`,
      stats: this.stats,
      logCount: this.logs.length,
      successRate:
        (
          (this.stats.stored /
            Math.max(this.stats.fetched - this.stats.duplicates, 1)) *
          100
        ).toFixed(2) + "%",
    };
  }
}

/**
 * News Processor - Main orchestration class
 */
class NewsProcessor {
  constructor() {
    this.logger = new PipelineLogger();
    this.isRunning = false;
    this.currentRun = null;
  }

  /**
   * Main pipeline execution
   * @param {Object} options - Pipeline options
   * @param {boolean} [options.skipAIFilter] - Use the keyword filter instead
   *   of spending an AI call per candidate article.
   * @returns {Promise<Object>} - Pipeline report
   */
  async processDailyNews(options = {}) {
    // Guard against overlapping runs. Each run costs up to ~115 upstream API
    // calls, so concurrent invocations would overlap feed and AI work.
    if (this.isRunning) {
      this.logger.warn("⚠️  Pipeline already running - ignoring duplicate request");
      return {
        ...this.logger.getReport(),
        alreadyRunning: true,
        message:
          "A pipeline run is already in progress. Wait for it to finish before starting another.",
      };
    }

    this.isRunning = true;
    this.currentRun = (async () => {
      this.logger = new PipelineLogger();
      this.logger.stats.startTime = Date.now();

      try {
        this.logger.info("🚀 Starting news processing pipeline");

        // Step 1: Fetch articles
        this.logger.info("📡 Step 1: Fetching articles");
        const articles = await this._fetchArticles();
        this.logger.stats.fetched = articles.length;

        if (articles.length === 0) {
          this.logger.warn("❌ No articles fetched");
          this.logger.stats.endTime = Date.now();
          return this.logger.getReport();
        }

        this.logger.info(`✅ Fetched ${articles.length} articles`);

        // Step 2: Deduplicate against DB
        this.logger.info("🔍 Step 2: Checking for duplicates");
        const uniqueArticles = await this._deduplicateArticles(articles);
        this.logger.stats.duplicates = articles.length - uniqueArticles.length;

        if (uniqueArticles.length === 0) {
          this.logger.warn("⚠️  All articles are duplicates");
          this.logger.stats.endTime = Date.now();
          return this.logger.getReport();
        }

        this.logger.info(
          `✅ ${uniqueArticles.length} unique articles (${this.logger.stats.duplicates} duplicates skipped)`,
        );

        // Step 3: Filter by relevance
        this.logger.info("🎯 Step 3: Filtering by relevance");
        const relevantArticles = await this._filterByRelevance(
          uniqueArticles,
          options,
        );
        this.logger.stats.filtered = relevantArticles.length;

        if (relevantArticles.length === 0) {
          this.logger.warn("⚠️  No relevant articles after filtering");
          this.logger.stats.endTime = Date.now();
          return this.logger.getReport();
        }

        this.logger.info(`✅ ${relevantArticles.length} relevant articles`);

        // Step 4: Summarize and enrich with AI
        this.logger.info("🤖 Step 4: AI summarization and enrichment");
        const summarizedArticles =
          await this._summarizeArticles(relevantArticles);
        this.logger.stats.summarized = summarizedArticles.length;

        if (summarizedArticles.length === 0) {
          this.logger.warn("⚠️  No articles successfully summarized");
          this.logger.stats.endTime = Date.now();
          return this.logger.getReport();
        }

        this.logger.info(`✅ ${summarizedArticles.length} articles summarized`);

        // Step 5: Store in database
        this.logger.info("💾 Step 5: Storing in database");
        await this._storeArticles(summarizedArticles);
        generateTopDetailedSummaries()
          .then((result) =>
            this.logger.info("Tier 2 detailed summaries processed", result),
          )
          .catch((error) =>
            this.logger.error("Tier 2 detailed summary batch failed", {
              error: error.message,
            }),
          );
        this.logger.stats.endTime = Date.now();

        if (this.logger.stats.stored === 0) {
          this.logger.error(
            "❌ Pipeline produced no stored articles despite successful summaries",
          );
        }

        this.logger.info("✅ Pipeline completed successfully");
        return this.logger.getReport();
      } catch (error) {
        this.logger.error("❌ Pipeline failed", {
          error: error.message,
          stack: error.stack,
        });
        this.logger.stats.endTime = Date.now();
        return this.logger.getReport();
      }
    })();

    try {
      return await this.currentRun;
    } finally {
      this.isRunning = false;
      this.currentRun = null;
    }
  }

  /**
   * Step 1: Fetch articles from RSS feeds
   */
  async _fetchArticles() {
    try {
      const articles = await fetchRssArticles();
      return articles;
    } catch (error) {
      this.logger.error("Failed to fetch articles", { error: error.message });
      return [];
    }
  }

  /**
   * Step 2: Deduplicate against existing news in DB
   */
  async _deduplicateArticles(articles) {
    const urls = articles.map((a) => a.url).filter(Boolean);

    if (urls.length === 0) return articles;

    try {
      // Find existing news with same URLs
      const existing = await News.find({ url: { $in: urls } }).select("url");
      const existingUrls = new Set(existing.map((n) => n.url));

      const unique = articles.filter((a) => !existingUrls.has(a.url));
      return unique;
    } catch (error) {
      this.logger.error("Deduplication failed", {
        error: error.message,
      });
      return articles; // Return all if dedup fails
    }
  }

  /**
   * Step 3: Filter by relevance using AI or keywords
   */
  async _filterByRelevance(articles, options = {}) {
    this.logger.info("⚡ RSS ingestion accepts feed items without paid AI filtering");
    return articles;
  }

  /**
   * Keyword-based filtering (fallback)
   */
  _keywordFilter(article) {
    const text = `${article.headline} ${article.summary}`.toLowerCase();

    const upscKeywords = [
      "upsc",
      "budget",
      "cabinet",
      "minister",
      "parliament",
      "lok sabha",
      "rajya sabha",
      "defense",
      "economy",
      "international",
      "science",
      "polity",
    ];

    const hasUPSCKeyword = upscKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return hasUPSCKeyword;
  }

  /**
   * AI-based relevance analysis with retry
   */
  async _analyzeRelevance(article, attempt = 1) {
    try {
      const preview = `${article.headline}. ${article.summary}`.substring(
        0,
        200,
      );
      const result = await quickAnalyze(preview);
      return result;
    } catch (error) {
      if (attempt < PIPELINE_CONFIG.RETRY_ATTEMPTS) {
        this.logger.warn("Retrying relevance analysis", {
          attempt,
          headline: article.headline?.substring(0, 30),
        });
        await new Promise((resolve) =>
          setTimeout(resolve, PIPELINE_CONFIG.RETRY_DELAY),
        );
        return this._analyzeRelevance(article, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Step 4: Summarize articles with AI
   */
  async _summarizeArticles(articles) {
    const summarized = [];
    for (const article of articles) {
      const sentences = article.summary
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
      const shortSummary = sentences.slice(0, 3).join(" ");
      const usableSummary =
        shortSummary.length >= 50
          ? shortSummary
          : `${article.headline}. Read the original report at ${article.source}.`;
      const bulletPoints = [
        article.headline,
        ...sentences.slice(0, 4),
        `Source: ${article.source}`,
      ].slice(0, 5);
      summarized.push({
        ...article,
        summary: usableSummary,
        bulletPoints,
        tags: this._deriveTags(`${article.headline} ${article.summary}`),
        aiCategory: null,
      });
    }

    return classifyArticles(summarized);
  }

  _deriveTags(text) {
    const lower = text.toLowerCase();
    const rules = [
      ["Polity", ["parliament", "government", "minister", "court", "election"]],
      ["Economy", ["economy", "budget", "market", "bank", "payment", "trade"]],
      ["Defense", ["defence", "defense", "military", "army", "navy", "missile"]],
      ["Science", ["science", "technology", "tech", "isro", "space", "semiconductor"]],
      ["International", ["international", "foreign", "bilateral", "un", "global"]],
    ];
    const tags = rules
      .filter(([, keywords]) => keywords.some((keyword) => lower.includes(keyword)))
      .map(([tag]) => tag);
    return tags.length ? tags.slice(0, 3) : ["Polity"];
  }

  /**
   * Summarize with retry logic
   */
  async _summarizeWithRetry(articleText, attempt = 1) {
    try {
      const result = await summarizeArticle(articleText);
      return result;
    } catch (error) {
      if (attempt < PIPELINE_CONFIG.RETRY_ATTEMPTS) {
        this.logger.warn("Retrying summarization", {
          attempt,
          error: error.message,
        });
        await new Promise((resolve) =>
          setTimeout(resolve, PIPELINE_CONFIG.RETRY_DELAY),
        );
        return this._summarizeWithRetry(articleText, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Step 5: Store articles in MongoDB
   */
  async _storeArticles(articles) {
    for (const article of articles) {
      try {
        // Feed category first, then keyword rules, then the AI's suggestion.
        // Resolved here rather than mid-pipeline so the stored article always
        // carries a category and the News enum can never reject the write.
        const { category, derivedBy } = resolveCategory({
          feedCategory: article.feedCategory || article.rssCategory,
          text: `${article.headline || ""} ${article.summary || ""} ${
            article.content || ""
          }`,
          aiCategory: article.aiCategory,
        });

        // This is the deterministic short summary created from the RSS
        // description; source text is not stored.
        const newsData = {
          source: article.source || "The Hindu",
          headline: article.headline,
          summary: article.summary,
          bulletPoints: article.bulletPoints?.length
            ? article.bulletPoints
            : [article.summary].filter(Boolean),
          tags: article.tags?.length
            ? article.tags
            : article.syllabusHints?.length
              ? article.syllabusHints.slice(0, 3)
              : ["Polity"],
          section: article.section,
          sourceId: article.sourceId,
          feedId: article.feedId,
          publishedAt: article.publishedAt,
          summaryStatus: "SUMMARIZED",
          summarizedAt: new Date(),
          modelUsed: "rule-based",
          category,
          topic: article.topic,
          secondaryTopics: article.secondaryTopics || [],
          topicSource: article.topicSource,
          topicConfidence: article.topicConfidence,
          subtopics: article.subtopics || [],
          quiz: article.quiz?.length ? article.quiz : undefined,
          url: article.url,
          date: article.publishedAt || new Date(),
          isPublished: true,
        };

        // Fail loudly on a malformed payload instead of swallowing it - a
        // silent skip here previously made the pipeline report success while
        // storing nothing.
        new News(newsData).validateSync();

        const created = await News.create(newsData);
        this.logger.info("Article stored", {
          id: created._id,
          headline: created.headline?.substring(0, 40),
          category,
          derivedBy,
        });
        this.logger.stats.stored++;
      } catch (error) {
        this.logger.error("Failed to store article", {
          headline: article.headline?.substring(0, 40),
          error: error.message,
        });
        this.logger.stats.failed++;
      }
    }
  }

  /**
   * Get pipeline status/report
   */
  getReport() {
    return this.logger.getReport();
  }
}

// Export singleton instance
export default new NewsProcessor();
