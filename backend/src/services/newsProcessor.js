/**
 * News Processor Service
 * Orchestrates the complete news processing pipeline:
 * 1. Fetch articles from RSS feeds
 * 2. Create a rule-based short summary
 * 3. Store in MongoDB
 * 4. Handle failures and deduplication
 */

import News from "../models/News.js";
import { fetchRssArticles } from "./rssFetcher.js";
import { resolveCategory } from "../utils/category.js";
import { istDayKey, istDayRange } from "../utils/date.js";
import { generateTopDetailedSummaries } from "./detailedSummaryService.js";
import { classifyArticles } from "./topicClassifier.js";
import { generateArticleContent } from "./content/contentGenerator.js";
import { config } from "../config/env.js";

/** Local word counter for sourceWordCount bookkeeping on the fallback path. */
const countWords = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

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
      skippedOutsideRetention: 0,
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
   * @param {Object} options - Pipeline options (reserved for future use)
   * @returns {Promise<Object>} - Pipeline report
   */
  async processDailyNews(options = {}) {
    const { dryRun = false } = options;
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
        const { articles, skippedOutsideRetention } = await this._fetchArticles();
        this.logger.stats.fetched = articles.length;
        this.logger.stats.skippedOutsideRetention = skippedOutsideRetention;

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

        // Step 3: Summarize and enrich with AI
        this.logger.info("🤖 Step 3: AI summarization and enrichment");
        const summarizedArticles = await this._summarizeArticles(
          uniqueArticles,
          dryRun
            ? null
            : async (batch) => {
                const classified = await classifyArticles(batch);
                await this._storeArticles(classified);
              },
        );
        this.logger.stats.summarized = summarizedArticles.length;

        if (summarizedArticles.length === 0) {
          this.logger.warn("⚠️  No articles successfully summarized");
          this.logger.stats.endTime = Date.now();
          return this.logger.getReport();
        }

        this.logger.info(`✅ ${summarizedArticles.length} articles summarized`);

        if (dryRun) {
          this.logger.info("🧪 Dry run complete; no articles stored or deleted", {
            summarized: summarizedArticles.length,
          });
          this.logger.stats.endTime = Date.now();
          return this.logger.getReport();
        }

        // Articles were persisted in bounded batches during summarization.
        if (this.logger.stats.stored >= config.MIN_ARTICLES_BEFORE_CLEANUP) {
          await this._cleanupOldNews();
        } else {
          this.logger.warn("Skipping cleanup because ingest stored too few articles", {
            stored: this.logger.stats.stored,
            minimum: config.MIN_ARTICLES_BEFORE_CLEANUP,
          });
        }
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
      return await fetchRssArticles();
    } catch (error) {
      this.logger.error("Failed to fetch articles", { error: error.message });
      return { articles: [], skippedOutsideRetention: 0 };
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
   * Step 3: Generate structured content (summary, keyFacts, detailed) with AI
   */
  async _summarizeArticles(articles, onBatch = null) {
    const summarized = [];
    let pendingBatch = [];
    let aiCalls = 0;
    for (const article of articles) {
      try {
        // Single AI call produces headline/summary/keyFacts/detailed together
        // so the model can keep them distinct (services/content/).
        if (aiCalls >= config.AI_DAILY_LIMIT) {
          throw new Error("AI daily limit reached; using deterministic fallback");
        }
        aiCalls += 1;
        const content = await this._summarizeWithRetry({
          source: article.source,
          section: article.section,
          title: article.headline,
          // RSS feeds rarely carry the article body, so the input is usually
          // the headline plus the feed snippet. sourceWordCount on the result
          // records what the model actually saw.
          text: `${article.headline}. ${article.summary}${
            article.content ? `. ${article.content}` : ""
          }`,
        });

        summarized.push({
          ...article,
          // v2 content model: no separate subtitle. The summary lives in the
          // Overview tab; an empty gist keeps the header from showing a deck
          // that duplicates the summary's first sentence.
          gist: "",
          headline: content.headline || article.headline,
          summary: content.summary,
          bulletPoints: content.keyFacts || [],
          keyFacts: content.keyFacts || [],
          tags: content.tags,
          subtopics: content.subtopics,
          aiCategory: content.category,
          promptVersion: content.promptVersion,
          sourceWordCount: content.sourceWordCount,
          modelUsed: content.modelUsed,
        });
        pendingBatch.push(summarized[summarized.length - 1]);
        if (onBatch && pendingBatch.length >= PIPELINE_CONFIG.BATCH_SIZE) {
          await onBatch(pendingBatch);
          pendingBatch = [];
        }
      } catch (error) {
        // If AI fails, fall back to rule-based summary from RSS description
        this.logger.warn("AI summarization failed, using fallback", {
          headline: article.headline?.substring(0, 50),
          error: error.message,
        });

        // Deterministic fallback. The snippet IS the overview, so it is used
        // as the summary - but keyFacts must never repeat it. If the snippet
        // is too thin to summarize, say so with one honest sentence instead
        // of padding.
        const sentences = article.summary
          .split(/(?<=[.!?])\s+/)
          .map((sentence) => sentence.trim())
          .filter(Boolean);
        const shortSummary = sentences.slice(0, 3).join(" ");
        const fallbackSummary =
          shortSummary.length >= 50
            ? shortSummary
            : `${article.headline}. Read the original report at ${article.source}.`;
        const usableSummary = fallbackSummary.slice(0, 1000);

        summarized.push({
          ...article,
          gist: "",
          summary: usableSummary,
          bulletPoints: [],
          keyFacts: [],
          tags: this._deriveTags(`${article.headline} ${article.summary}`),
          aiCategory: null,
          promptVersion: null,
          sourceWordCount: countWords(
            `${article.headline} ${article.summary}`,
          ),
        });
        pendingBatch.push(summarized[summarized.length - 1]);
        if (onBatch && pendingBatch.length >= PIPELINE_CONFIG.BATCH_SIZE) {
          await onBatch(pendingBatch);
          pendingBatch = [];
        }
      }
    }

    if (onBatch && pendingBatch.length) {
      await onBatch(pendingBatch);
    }

    return onBatch ? summarized : classifyArticles(summarized);
  }

  _deriveTags(text) {
    const lower = text.toLowerCase();
    const rules = [
      ["Polity", ["parliament", "government", "minister", "court", "election"]],
      ["Economy", ["economy", "budget", "market", "bank", "payment", "trade"]],
      ["Defense", ["defence", "defense", "military", "army", "navy", "missile"]],
      ["Science", ["science", "technology", "tech", "isro", "space", "semiconductor"]],
      ["International", ["international", "foreign", "bilateral", "global"]],
    ];
    const tags = rules
      .filter(([, keywords]) =>
        keywords.some((keyword) => new RegExp(`\\b${keyword}\\b`, "i").test(lower)),
      )
      .map(([tag]) => tag);
    return tags.length ? tags.slice(0, 3) : ["International"];
  }

  /**
   * Generate content with retry logic
   */
  async _summarizeWithRetry(input, attempt = 1) {
    try {
      return await generateArticleContent(input);
    } catch (error) {
      // A provider-wide 429 will affect every remaining article in this run.
      // Retrying it only delays the deterministic fallback and keeps the
      // dashboard empty while hundreds of RSS items are processed.
      if (error.statusCode === 429 || /\b429\b|rate-limited/i.test(error.message)) {
        throw error;
      }
      if (attempt < PIPELINE_CONFIG.RETRY_ATTEMPTS) {
        this.logger.warn("Retrying summarization", {
          attempt,
          error: error.message,
        });
        await new Promise((resolve) =>
          setTimeout(resolve, PIPELINE_CONFIG.RETRY_DELAY),
        );
        return this._summarizeWithRetry(input, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Step 4: Store articles in MongoDB
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

        // This is the structured content produced by the content pipeline;
        // source text is never stored.
        const newsData = {
          source: article.source || "The Hindu",
          headline: article.headline,
          // v2: no subtitle. Empty gist keeps the header from showing a deck
          // that duplicates the summary.
          gist: article.gist || "",
          summary: article.summary,
          bulletPoints: article.keyFacts || article.bulletPoints || [],
          keyFacts: article.keyFacts || article.bulletPoints || [],
          promptVersion: article.promptVersion || null,
          sourceWordCount: article.sourceWordCount,
          ...(article.sourceTier ? { sourceTier: article.sourceTier } : {}),
          tags: article.tags?.length
            ? article.tags
            : (article.topicHints ?? article.syllabusHints ?? []).length
              ? (article.topicHints ?? article.syllabusHints).slice(0, 3)
              : ["International"],
          section: article.section,
          sourceId: article.sourceId,
          feedId: article.feedId,
          publishedAt: article.publishedAt,
          publishedDayKey: article.publishedDayKey || istDayKey(article.publishedAt),
          summaryStatus: "SUMMARIZED",
          summarizedAt: new Date(),
          modelUsed: article.modelUsed || (article.aiCategory ? "unknown-ai" : "rule-based"),
          category,
          topic: article.topic,
          secondaryTopics: article.secondaryTopics || [],
          topicSource: article.topicSource,
          topicConfidence: article.topicConfidence,
          subtopics: article.subtopics || [],
          url: article.url,
          // Detailed narrative. The ingestion call only sees the RSS snippet,
          // so it produces a narrative only when that snippet was already FULL
          // text (rare). Otherwise leave detailedStatus at its NONE default so
          // the dedicated detailed path - which fetches the full article page -
          // can still attempt it for top-N and on-demand requests. UNAVAILABLE
          // is set by that path when the full text is genuinely blocked/thin,
          // never here, or we would prevent a legitimate attempt.
          ...(article.detailed
            ? {
                detailedSummary: article.detailed,
                detailedStatus: "DONE",
                detailedConfidence: article.confidence,
                detailedGeneratedAt: new Date(),
              }
            : {}),
          // `date` is the ingestion day used by the dashboard's current-day
          // query. Keep the publisher timestamp separately in `publishedAt`;
          // RSS feeds commonly retain items published before today.
          date: new Date(),
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
   * Clean up old news articles, keeping only those from the current UTC day.
   * This ensures the database only retains recent articles and removes stale data.
   */
  async _cleanupOldNews() {
    try {
      const now = new Date();
      const range = istDayRange(now);
      const result = await News.deleteMany({
        $or: [
          { publishedDayKey: { $exists: true, $ne: istDayKey(now) } },
          {
            publishedDayKey: { $exists: false },
            publishedAt: { $lt: range.$gte },
          },
        ],
      });
      this.logger.info(`🧹 Cleaned up ${result.deletedCount} old news articles`);
      return result.deletedCount;
    } catch (error) {
      this.logger.error("Failed to clean up old news", {
        error: error.message,
      });
      return 0;
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
