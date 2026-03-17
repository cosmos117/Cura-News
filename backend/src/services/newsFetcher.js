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

  // Indian sources preferred
  SOURCES: [
    "the-hindu",
    "indian-express",
    "times-of-india",
    "bbc-news",
    "reuters",
  ],

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
          apiKey: this.apiKey,
        },
        timeout: NEWS_CONFIG.TIMEOUT,
      });

      if (response.status !== 200) {
        throw new Error(`NewsAPI returned status ${response.status}`);
      }

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
      console.error("❌ Error fetching from NewsAPI:", error.message);

      // Return empty array on error (pipeline continues)
      return [];
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

    // Normalize source to CURA NEWS enum
    const sourceMap = {
      "the-hindu": "The Hindu",
      "indian-express": "Indian Express",
      "times-of-india": "Times of India",
      bbc: "The Hindu", // Default to The Hindu for non-supported sources
      reuters: "The Hindu",
    };

    const sourceName =
      sourceMap[source?.id?.toLowerCase()] ||
      sourceMap[source?.name?.toLowerCase()] ||
      "The Hindu"; // Default source

    return {
      headline: title,
      summary: description,
      content: content,
      source: sourceName,
      url: url,
      image: urlToImage,
      publishedAt: new Date(publishedAt),
      rawSource: source?.name || "Unknown",
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
        // Continue with next keyword
      }
    }

    // Remove duplicates by URL
    const unique = this._deduplicateByUrl(allArticles);
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
    return await this.fetchMultipleKeywords(NEWS_CONFIG.KEYWORDS, 5);
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
