/**
 * News Processor Service
 * Orchestrates the complete news processing pipeline:
 * 1. Fetch articles from NewsAPI
 * 2. Filter by relevance (AI or keywords)
 * 3. Summarize with AI
 * 4. Store in MongoDB
 * 5. Handle failures and deduplication
 */

import News from "../models/News.js";
import newsFetcher from "./newsFetcher.js";
import { summarizeArticle, quickAnalyze } from "./aiService.js";

/**
 * Pipeline configuration
 */
const PIPELINE_CONFIG = {
  BATCH_SIZE: 5, // Process 5 articles at a time
  AI_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 2000, // 2 seconds
  SKIP_AI_FILTER: false, // Use AI for filtering (set true to use keyword filter only)
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
  }

  /**
   * Main pipeline execution
   * @param {Object} options - Pipeline options
   * @returns {Promise<Object>} - Pipeline report
   */
  async processDailyNews(options = {}) {
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
      const relevantArticles = await this._filterByRelevance(uniqueArticles);
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
      this.logger.stats.endTime = Date.now();

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
  }

  /**
   * Step 1: Fetch articles from NewsAPI
   */
  async _fetchArticles() {
    try {
      const articles = await newsFetcher.fetchDailyNews();
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
  async _filterByRelevance(articles) {
    const relevantArticles = [];
    const batchSize = 5;

    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, Math.min(i + batchSize, articles.length));

      for (const article of batch) {
        try {
          if (PIPELINE_CONFIG.SKIP_AI_FILTER) {
            // Keyword-based filtering
            const isRelevant = this._keywordFilter(article);
            if (isRelevant) {
              relevantArticles.push(article);
            }
          } else {
            // AI-based filtering
            const analysis = await this._analyzeRelevance(article);
            if (analysis.isRelevant) {
              article.analysisConfidence = analysis.confidence;
              article.analysisTopic = analysis.primaryTopic;
              relevantArticles.push(article);
            }
          }
        } catch (error) {
          this.logger.warn("Failed to analyze relevance", {
            headline: article.headline?.substring(0, 50),
            error: error.message,
          });
        }
      }

      // Rate limiting between batches
      if (i + batchSize < articles.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return relevantArticles;
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
    const batchSize = PIPELINE_CONFIG.BATCH_SIZE;

    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, Math.min(i + batchSize, articles.length));

      for (const article of batch) {
        try {
          const fullText = `${article.headline}. ${article.summary}${
            article.content ? `. ${article.content}` : ""
          }`;

          if (fullText.length < 100) {
            this.logger.warn("Article too short to summarize", {
              headline: article.headline,
              length: fullText.length,
            });
            continue;
          }

          this.logger.info("Summarizing article", {
            headline: article.headline?.substring(0, 40),
          });

          const summary = await this._summarizeWithRetry(fullText);

          // Merge summarization results with original article
          const enrichedArticle = {
            ...article,
            ...summary,
          };

          summarized.push(enrichedArticle);
        } catch (error) {
          this.logger.error("Failed to summarize article", {
            headline: article.headline?.substring(0, 40),
            error: error.message,
          });
          this.logger.stats.failed++;
        }
      }

      // Rate limiting between batches
      if (i + batchSize < articles.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    return summarized;
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
        const newsData = {
          source: article.source || "The Hindu",
          headline: article.headline,
          summary: article.summary,
          bulletPoints: article.bulletPoints || [],
          tags: article.tags || ["Polity"],
          subtopics: article.subtopics || [],
          quiz: article.quiz || [],
          url: article.url,
          date: article.publishedAt || new Date(),
          isPublished: true,
        };

        const created = await News.create(newsData);
        this.logger.info("Article stored", {
          id: created._id,
          headline: created.headline?.substring(0, 40),
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
