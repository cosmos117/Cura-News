/**
 * News Processor Service
 * Orchestrates the complete news processing pipeline:
 * 1. Fetch articles from RSS feeds
 * 2. Build a short summary and key facts from the publisher's own text
 *    (page description, RSS description, or the article's lead sentences)
 * 3. Store in MongoDB
 * 4. Handle failures and deduplication
 *
 * No AI is used for short summaries; the AI quota is kept for detailed
 * summaries and the occasional ambiguous topic.
 */

import News from "../models/News.js";
import { fetchRssArticles } from "./rssFetcher.js";
import { TOPIC_LABELS } from "../config/topics.js";
import { istDayKey, istDayRange } from "../utils/date.js";
import { generateTopDetailedSummaries } from "./detailedSummaryService.js";
import { classifyArticles } from "./topicClassifier.js";
import { buildShortSummary } from "./content/shortSummary.js";
import { extractArticleText } from "./articleTextExtractor.js";
import { config } from "../config/env.js";

/**
 * Pipeline configuration
 */
const PIPELINE_CONFIG = {
  BATCH_SIZE: 5, // Process 5 articles at a time
  // Pages shorter than this are too thin to take sentences from.
  SUMMARY_PAGE_MIN_CHARS: 300,
  // After this many failed fetches in a row a site is skipped for the run, so
  // a site that is down cannot stall the pipeline on timeouts.
  HOST_FAILURE_LIMIT: 5,
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
      // New articles left for the next run because of INGEST_MAX_PER_RUN
      deferred: 0,
      // How each short summary was written, e.g. { extractive: 12, "publisher-page": 30 }
      summaryMethods: {},
      // Page fetches per source: { ok, thin, robots, failed, skipped }
      pageFetch: {},
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

        const { selected, deferred } = this._capForRun(uniqueArticles);
        this.logger.stats.deferred = deferred;
        if (deferred) {
          this.logger.info(
            `⏳ Storing ${selected.length} this run; ${deferred} wait for the next run`,
            { cap: config.INGEST_MAX_PER_RUN },
          );
        }

        // Step 3: Short summaries and topics (no AI for summaries)
        this.logger.info("📝 Step 3: Short summaries and topics");
        const summarizedArticles = await this._summarizeArticles(
          selected,
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
   * Keep a run to INGEST_MAX_PER_RUN new articles. Papers take turns, newest
   * story first, so one busy paper cannot crowd out the others. The rest are
   * not lost: they are picked up by the next run while still in the feeds.
   *
   * @returns {{ selected: Object[], deferred: number }}
   */
  _capForRun(articles) {
    const cap = config.INGEST_MAX_PER_RUN;
    if (!cap || articles.length <= cap) return { selected: articles, deferred: 0 };

    const queues = new Map();
    const newestFirst = [...articles].sort(
      (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
    );
    for (const article of newestFirst) {
      if (!queues.has(article.source)) queues.set(article.source, []);
      queues.get(article.source).push(article);
    }

    const selected = [];
    while (selected.length < cap) {
      let took = false;
      for (const queue of queues.values()) {
        if (selected.length >= cap) break;
        const next = queue.shift();
        if (next) {
          selected.push(next);
          took = true;
        }
      }
      if (!took) break;
    }
    return { selected, deferred: articles.length - selected.length };
  }

  /**
   * Step 3: Short summary and key facts for each article, built from the
   * publisher's own text (see content/shortSummary.js). Pages are fetched one
   * at a time with a pause between requests.
   */
  async _summarizeArticles(articles, onBatch = null) {
    const summarized = [];
    let pendingBatch = [];
    const fetchPage = this._createPageFetcher();

    for (const article of articles) {
      const page = await fetchPage(article);
      const content = buildShortSummary({
        headline: article.headline,
        source: article.source,
        rssDescription: article.rssDescription,
        pageDescriptions: page?.descriptions,
        // Paragraph breaks help tell sentences from headings; pages without
        // <p> paragraphs fall back to the flattened text.
        pageText: page?.available
          ? page.paragraphs.length >= 3
            ? page.paragraphs.join("\n")
            : page.text
          : "",
      });

      const methods = this.logger.stats.summaryMethods;
      methods[content.method] = (methods[content.method] || 0) + 1;

      summarized.push({
        ...article,
        // v2 content model: no separate subtitle. The summary lives in the
        // Overview tab; an empty gist keeps the header from showing a deck
        // that duplicates the summary's first sentence.
        gist: "",
        summary: content.summary,
        bulletPoints: content.keyFacts,
        keyFacts: content.keyFacts,
        tags: this._deriveTags(
          `${article.headline} ${content.summary} ${content.keyFacts.join(" ")}`,
        ),
        aiCategory: null,
        promptVersion: null,
        sourceWordCount: content.sourceWords,
        summaryMethod: content.method,
        modelUsed: "rule-based",
      });
      pendingBatch.push(summarized[summarized.length - 1]);
      if (onBatch && pendingBatch.length >= PIPELINE_CONFIG.BATCH_SIZE) {
        await onBatch(pendingBatch);
        pendingBatch = [];
      }
    }

    if (onBatch && pendingBatch.length) {
      await onBatch(pendingBatch);
    }

    this.logger.info("Short summaries built", {
      methods: this.logger.stats.summaryMethods,
      pageFetch: this.logger.stats.pageFetch,
    });

    return onBatch ? summarized : classifyArticles(summarized);
  }

  /**
   * A function that fetches one article's page politely: requests are spaced
   * by PAGE_FETCH_DELAY_MS, a site that keeps failing is skipped for the rest
   * of the run, and everything is counted per source in the pipeline stats.
   * Returns null when page fetching is switched off or skipped.
   */
  _createPageFetcher() {
    const failuresByHost = new Map();
    const skippedHosts = new Set();
    let lastFetchEnded = 0;

    const count = (source, outcome) => {
      const row = (this.logger.stats.pageFetch[source] ||= {
        ok: 0,
        thin: 0,
        robots: 0,
        failed: 0,
        skipped: 0,
      });
      row[outcome] += 1;
    };

    return async (article) => {
      if (!config.SUMMARY_PAGE_FETCH || !article.url) return null;

      let host;
      try {
        host = new URL(article.url).hostname;
      } catch {
        return null;
      }
      if (skippedHosts.has(host)) {
        count(article.source, "skipped");
        return null;
      }

      const wait = lastFetchEnded + config.PAGE_FETCH_DELAY_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      const page = await extractArticleText(article.url, {
        minChars: PIPELINE_CONFIG.SUMMARY_PAGE_MIN_CHARS,
        paragraphs: true,
      });
      lastFetchEnded = Date.now();

      if (page.available) {
        count(article.source, "ok");
        failuresByHost.set(host, 0);
      } else if (page.failed) {
        count(article.source, "failed");
        const failures = (failuresByHost.get(host) || 0) + 1;
        failuresByHost.set(host, failures);
        if (failures >= PIPELINE_CONFIG.HOST_FAILURE_LIMIT) {
          skippedHosts.add(host);
          this.logger.warn("Page fetches keep failing; skipping this site for the run", {
            host,
            lastError: page.reason,
          });
        }
      } else if (/robots\.txt/.test(page.reason)) {
        count(article.source, "robots");
      } else {
        count(article.source, "thin");
      }
      return page;
    };
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
   * Step 4: Store articles in MongoDB
   */
  async _storeArticles(articles) {
    for (const article of articles) {
      try {
        // One topic per article: the topic classifier's answer (keywords,
        // then feed section, then AI) is final, and the category shown on
        // cards is only its label.
        const topic = TOPIC_LABELS[article.topic] ? article.topic : "misc";
        const category = TOPIC_LABELS[topic];

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
          summaryMethod: article.summaryMethod,
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
          topic,
          secondaryTopics: article.secondaryTopics || [],
          topicSource: article.topicSource,
          topicConfidence: article.topicConfidence,
          subtopics: article.subtopics || [],
          url: article.url,
          // Detailed summaries are generated only by the dedicated path,
          // which fetches and validates the complete original article.
          detailedStatus: "NONE",
          detailedSummary: null,
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
          topic,
          topicSource: article.topicSource,
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
