/**
 * News Fetcher Service
 * Fetches news articles from NewsAPI
 * Normalizes data to match CURA NEWS schema
 */

import axios from "axios";

/**
 * Configuration for news sources and keywords
 */
const NEWS_CONFIG = {
  // NewsAPI.org configuration
  API_BASE: "https://newsapi.org/v2",
  TIMEOUT: 10000, // 10 second timeout

  // Keywords for UPSC/CDS relevant news
  KEYWORDS: [
    "UPSC",
    "Union Budget",
    "Union Cabinet",
    "Cabinet Minister",
    "Government of India",
    "Parliament",
    "Lok Sabha",
    "Rajya Sabha",
    "Bilateral Relations",
    "Defense Ministry",
    "Foreign Secretary",
    "Chief Justice",
    "Supreme Court",
    "Election Commission",
    "RBI",
    "GST",
    "Income Tax",
    "Infrastructure",
    "Climate Change",
    "Renewable Energy",
    "Space Agency",
    "ISRO",
  ],

  // Excluded keywords (entertainment, gossip, sports)
  EXCLUDED_KEYWORDS: [
    "Bollywood",
    "Celebrity",
    "Cricket",
    "IPL",
    "Sports",
    "Entertainment",
    "Movie",
    "Actor",
    "Actress",
    "Reality TV",
    "Games",
    "Weather",
  ],

  // Sources the News model can actually store. Passing these to NewsAPI avoids
  // fetching articles that _normalizeArticle would immediately discard.
  SOURCES: ["the-hindu", "indian-express", "times-of-india"],

  // Language
  LANGUAGE: "en",

  // Sort order
  SORT_BY: "publishedAt", // publishedAt, relevancy, popularity
};

/**
 * Fetch articles from NewsAPI
 * Implements caching and error handling
 */
class NewsFetcher {
  constructor() {
    this.apiKey = process.env.NEWS_API_KEY;
    this.cache = new Map(); // Simple in-memory cache
    this.cacheExpiry = 3600000; // 1 hour
  }

  /**
   * Main fetch method
   * @param {Object} options - Fetch options
   * @param {string} options.q - Search query
   * @param {number} options.pageSize - Results per page (1-100, default 20)
   * @param {number} options.page - Page number (default 1)
   * @returns {Promise<Array>} - Normalized articles
   */
  async fetchArticles(options = {}) {
    const {
      q = "India",
      pageSize = 30,
      page = 1,
      sortBy = NEWS_CONFIG.SORT_BY,
      sources = NEWS_CONFIG.SOURCES,
    } = options;

    if (!this.apiKey) {
      throw new Error("NEWS_API_KEY environment variable not configured");
    }

    // Check cache
    const cacheKey = `${q}-${pageSize}-${page}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) {
      console.log(`📦 Using cached results for: ${q}`);
      return cached;
    }

    try {
      console.log(`📡 Fetching articles from NewsAPI: ${q}`);

      const response = await axios.get(`${NEWS_CONFIG.API_BASE}/everything`, {
        params: {
          q: q,
          sortBy: sortBy,
          language: NEWS_CONFIG.LANGUAGE,
          pageSize: Math.min(pageSize, 100),
          page: page,
          sources: Array.isArray(sources) ? sources.join(",") : sources,
          apiKey: this.apiKey,
        },
        timeout: NEWS_CONFIG.TIMEOUT,
      });

      const { articles, totalResults } = response.data;

      if (!articles || articles.length === 0) {
        console.log(`⚠️  No articles found for: ${q}`);
        return [];
      }

      console.log(
        `✅ Fetched ${articles.length} articles (${totalResults} total results)`,
      );

      // Normalize articles
      const normalized = articles
        .map((article) => this._normalizeArticle(article))
        .filter((article) => article !== null); // Remove filtered articles

      // Cache results
      this._setCache(cacheKey, normalized);

      return normalized;
    } catch (error) {
      // Distinguish "upstream is broken" from "no results today". Swallowing
      // every error here made a bad API key, an expired plan and a rate limit
      // all look identical to a quiet news cycle, and the pipeline reported 0
      // fetched with no signal that anything was wrong.
      const status = error.response?.status;
      const detail = `status=${status ?? "n/a"} ${error.message}`;

      if (status === 401) {
        console.error(
          `❌ NewsAPI rejected the API key (${detail}). Check NEWS_API_KEY.`,
        );
        throw new Error(`NewsAPI authentication failed: ${detail}`);
      }

      if (status === 426) {
        console.error(
          `❌ NewsAPI plan does not permit this request (${detail}). Upgrading is required.`,
        );
        throw new Error(`NewsAPI plan upgrade required: ${detail}`);
      }

      if (status === 429) {
        console.error(`❌ NewsAPI rate limit hit (${detail}).`);
        throw new Error(`NewsAPI rate limited: ${detail}`);
      }

      console.error(`❌ Error fetching from NewsAPI: ${detail}`);
      throw new Error(`NewsAPI request failed: ${detail}`);
    }
  }

  /**
   * Normalize article to CURA NEWS format
   * @param {Object} article - Raw NewsAPI article
   * @returns {Object|null} - Normalized article or null if filtered
   */
  _normalizeArticle(article) {
    const {
      title,
      description,
      content,
      source,
      urlToImage,
      url,
      publishedAt,
      category,
    } = article;

    // Basic validation
    if (!title || !description) {
      return null;
    }

    // Check for excluded keywords
    const fullText = `${title} ${description}`.toLowerCase();
    for (const keyword of NEWS_CONFIG.EXCLUDED_KEYWORDS) {
      if (fullText.includes(keyword.toLowerCase())) {
        console.log(
          `🚫 Filtered (excluded keyword): "${title.substring(0, 50)}..."`,
        );
        return null;
      }
    }

    // Normalize source to CURA NEWS enum. Anything not in the News model enum is
    // DROPPED rather than relabelled - silently attributing a Reuters or BBC
    // article to "The Hindu" misrepresents the publisher and corrupts the
    // bySource stats.
    const SUPPORTED_SOURCES = {
      "the-hindu": "The Hindu",
      "indian-express": "Indian Express",
      "times-of-india": "Times of India",
    };

    const sourceName =
      SUPPORTED_SOURCES[source?.id?.toLowerCase()] ||
      SUPPORTED_SOURCES[source?.name?.toLowerCase()];

    if (!sourceName) {
      console.log(
        `🚫 Filtered (unsupported source "${source?.name || "unknown"}"): "${title.substring(0, 50)}..."`,
      );
      return null;
    }

    return {
      headline: title,
      summary: description,
      content: content,
      source: sourceName,
      url: url,
      image: urlToImage,
      publishedAt: new Date(publishedAt),
      rawSource: source?.name || "Unknown",
      // The publisher's own category label. Named `rssCategory` rather than
      // `category` so it can never collide with the AI's category in the
      // processor's `{ ...aiFields, ...article }` merge, and so the priority
      // order (feed > keywords > AI) stays explicit.
      rssCategory: category || null,
    };
  }

  /**
   * Fetch with multiple keywords (for comprehensive coverage)
   * @param {Array<string>} keywords - Keywords to search
   * @param {number} pageSize - Articles per keyword
   * @returns {Promise<Array>} - All normalized articles
   */
  async fetchMultipleKeywords(keywords = [], pageSize = 10) {
    const allArticles = [];
    const failures = [];

    for (const keyword of keywords) {
      try {
        const articles = await this.fetchArticles({
          q: keyword,
          pageSize: pageSize,
        });
        allArticles.push(...articles);

        // Rate limiting: wait between requests
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(
          `Failed to fetch for keyword "${keyword}":`,
          error.message,
        );
        failures.push({ keyword, error: error.message });
      }
    }

    // Remove duplicates by URL
    const unique = this._deduplicateByUrl(allArticles);

    // Every keyword failing means the upstream is unusable, not that there is
    // simply no news. Propagate so the pipeline reports an error.
    if (unique.length === 0 && failures.length > 0) {
      throw new Error(
        `All ${failures.length} NewsAPI requests failed. First error: ${failures[0].error}`,
      );
    }

    if (failures.length > 0) {
      console.warn(
        `⚠️  ${failures.length}/${keywords.length} keyword fetches failed`,
      );
    }

    console.log(
      `✅ Total unique articles: ${unique.length} from ${allArticles.length}`,
    );

    return unique;
  }

  /**
   * Fetch today's news with default UPSC keywords
   * @returns {Promise<Array>} - Normalized articles for today
   */
  async fetchDailyNews() {
    console.log("🌅 Starting daily news fetch...");
    // Fetch more candidates per keyword without increasing the number of
    // NewsAPI requests; deduplication and relevance filtering happen later.
    return await this.fetchMultipleKeywords(NEWS_CONFIG.KEYWORDS, 10);
  }

  /**
   * Remove duplicate articles by URL
   * @param {Array} articles - Articles to deduplicate
   * @returns {Array} - Unique articles
   */
  _deduplicateByUrl(articles) {
    const seen = new Set();
    const unique = [];

    for (const article of articles) {
      if (article.url && !seen.has(article.url)) {
        seen.add(article.url);
        unique.push(article);
      }
    }

    return unique;
  }

  /**
   * Cache management
   */
  _getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  _setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clearCache() {
    this.cache.clear();
    console.log("✅ Cache cleared");
  }
}

// Export singleton instance
export default new NewsFetcher();
