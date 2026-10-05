/**
 * Article category classification.
 *
 * Resolution order is deliberately cheapest-and-most-accurate first:
 *
 *   1. RSS/feed category  - the publisher's own label. Authoritative and free.
 *   2. Keyword rules      - deterministic, no network call, good coverage.
 *   3. AI suggestion      - only when 1 and 2 both come up empty.
 *   4. "Other"            - so every article is always categorised.
 *
 * The AI step is a genuine fallback rather than the primary path: calling
 * OpenAI for every article costs money and is slower, and the feed label plus
 * keyword rules already resolve the large majority of articles.
 */

export const NEWS_CATEGORIES = [
  "Politics",
  "Business",
  "Sports",
  "Tech",
  "World",
  "Entertainment",
  "Other",
];

const VALID_CATEGORIES = new Set(NEWS_CATEGORIES);

export const DEFAULT_CATEGORY = "Other";

/**
 * NewsAPI (and most RSS feeds) use their own category vocabulary. Mapping is
 * explicit rather than string-matched so an unmapped feed category falls
 * through to the keyword rules instead of being force-fit.
 */
const FEED_CATEGORY_MAP = {
  // NewsAPI /newsapi.org values
  business: "Business",
  entertainment: "Entertainment",
  sports: "Sports",
  sport: "Sports",
  technology: "Tech",
  tech: "Tech",
  world: "World",
  general: null, // too broad to be useful; let keywords decide
  health: null, // no Health category in the enum
  science: null, // no Science category in the enum
  politics: "Politics",
  // Common RSS <category> labels
  nation: "Politics",
  national: "Politics",
  "top stories": null,
  "breaking news": null,
  international: "World",
  global: "World",
  markets: "Business",
  economy: "Business",
  finance: "Business",
  industry: "Business",
  cricket: "Sports",
  football: "Sports",
  tennis: "Sports",
  olympics: "Sports",
  movies: "Entertainment",
  film: "Entertainment",
  music: "Entertainment",
  celebrity: "Entertainment",
  tv: "Entertainment",
  bollywood: "Entertainment",
  software: "Tech",
  gadgets: "Tech",
  internet: "Tech",
  ai: "Tech",
  cybersecurity: "Tech",
  startup: "Tech",
  "e-commerce": "Business",
};

/**
 * Keyword rules, evaluated in order. The first category with a hit wins, so
 * more specific categories must come before broader ones: an article about a
 * "tech startup raises funding" matches both Tech and Business, and Tech is the
 * more useful label.
 *
 * Each entry is [category, [terms]]. Terms are matched as whole words against
 * the lower-cased text so "ai" does not match "said" and "war" does not match
 * "award".
 */
const KEYWORD_RULES = [
  [
    "Sports",
    [
      "cricket", "ipl", "test match", "odi", "t20", "wicket", "innings",
      "batting", "bowling", "football", "soccer", "fifa", "world cup",
      "olympic", "tennis", "badminton", "hockey", "kabaddi", "rugby",
      "basketball", "formula one", "f1", "grand prix", "tournament", "striker",
      "goalkeeper", "midfielder", "team india", "sports ministry",
    ],
  ],
  [
    "Entertainment",
    [
      "bollywood", "hollywood", "film", "movie", "cinema", "box office",
      "actor", "actress", "celebrity", "singer", "music album", "web series",
      "netflix", "ott release", "trailer", "entertainment", "tv serial",
      "reality show", "award ceremony",
    ],
  ],
  [
    "Tech",
    [
      "artificial intelligence", "machine learning", "semiconductor", "chipmaker",
      "software", "startup", "start-up", "smartphone",
      "internet", "cybersecurity", "cyber attack", "data breach", "hacking",
      "social media", "algorithm", "quantum computing", "spacecraft",
      "satellite", "rocket", "isro", "nasa", "space agency", "gpu", "openai",
      "software glitch", "encryption", "5g", "6g", "blockchain", "cryptocurrency",
      "bitcoin", "electric vehicle", "ev manufacturer", "smartphone launch",
    ],
  ],
  [
    "Politics",
    [
      "parliament", "lok sabha", "rajya sabha", "election", "vote", "voter",
      "poll", "campaign", "prime minister", "president", "opposition party",
      "coalition", "cabinet", "minister", "chief minister", "governor",
      "bill", "legislation", "ordinance", "constituency", "electoral",
      "party leader", "coalition government", "motion", "rajya sabha mp",
      "lok sabha mp", "politician", "political party", "coalition talks",
    ],
  ],
  [
    "Business",
    [
      "business", "economy", "gdp", "inflation", "rbi", "repo rate", "stock market",
      "sensex", "nifty", "share price", "ipo", "quarterly results", "revenue",
      "profit", "merger", "acquisition", "startup funding", "market cap",
      "currency", "rupee", "trade deficit", "exports", "imports", "budget deficit",
      "corporate", "ceo", "cfo", "layoff", "investment", "billion", "ipo shares",
      "monetary policy", "fiscal policy", "tariff", "supply chain",
    ],
  ],
  [
    "World",
    [
      "united nations", "foreign minister", "bilateral", "summit", "ambassador",
      "embassy", "diplomatic", "geopolitical", "sanctions", "ceasefire",
      "border clash", "international", "global", "european union", "un security council",
      "global warming", "climate summit", "pandemic", "world bank", "imf",
      "china", "pakistan", "russia", "ukraine", "united states", "washington",
      "beijing", "new delhi talks", "foreign policy",
    ],
  ],
];

/**
 * Escape a term for use in a RegExp, then anchor it on word boundaries.
 *
 * Word boundaries are what keep "ai" from matching "said" and "war" from
 * matching "award" - without them the keyword rules would misfire constantly.
 */
const buildTermPattern = (term) =>
  new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

// Precompile once at module load.
const COMPILED_RULES = KEYWORD_RULES.map(([category, terms]) => [
  category,
  terms.map((term) => ({ term, pattern: buildTermPattern(term) })),
]);

/**
 * Coerce an arbitrary string to a valid category, or null.
 * @param {string} value
 * @returns {string|null}
 */
const asCategory = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // Case-insensitive match against the enum, so "tech" resolves to "Tech".
  return VALID_CATEGORIES.has(trimmed) ? trimmed : null;
};

/**
 * Resolve a category from the feed's own category label.
 * @param {string} feedCategory - e.g. NewsAPI's "technology"
 * @returns {string|null} - Category, or null when unmapped/too broad
 */
export const categoryFromFeed = (feedCategory) => {
  if (typeof feedCategory !== "string" || !feedCategory.trim()) return null;

  const key = feedCategory.trim().toLowerCase();
  if (key in FEED_CATEGORY_MAP) {
    return FEED_CATEGORY_MAP[key];
  }

  // Fall back to a substring scan for compound labels such as
  // "Business & Finance" or "Top News: Politics".
  for (const [needle, mapped] of Object.entries(FEED_CATEGORY_MAP)) {
    if (mapped && needle.length > 3 && key.includes(needle)) {
      return mapped;
    }
  }

  // Already a valid category under a different casing.
  return asCategory(feedCategory);
};

/**
 * Resolve a category from article text using keyword rules.
 * @param {string} text - Headline + summary (+ content when available)
 * @returns {string|null} - Category, or null when nothing matched
 */
export const categoryFromKeywords = (text) => {
  if (typeof text !== "string" || !text.trim()) return null;

  for (const [category, terms] of COMPILED_RULES) {
    if (terms.some(({ pattern }) => pattern.test(text))) {
      return category;
    }
  }

  return null;
};

/**
 * Normalise an AI-suggested category.
 * @param {string} aiCategory
 * @returns {string|null}
 */
export const categoryFromAi = (aiCategory) => asCategory(aiCategory);

/**
 * Full resolution chain: feed category, then keywords, then AI, then default.
 *
 * @param {Object} input
 * @param {string} [input.feedCategory] - The publisher/feed category label
 * @param {string} [input.text] - Headline, summary and/or content
 * @param {string} [input.aiCategory] - AI suggestion, used only as a fallback
 * @returns {{category: string, derivedBy: string}} - Category and its source
 */
export const resolveCategory = ({ feedCategory, text, aiCategory } = {}) => {
  const fromFeed = categoryFromFeed(feedCategory);
  if (fromFeed) return { category: fromFeed, derivedBy: "feed" };

  const fromKeywords = categoryFromKeywords(text);
  if (fromKeywords) return { category: fromKeywords, derivedBy: "keywords" };

  const fromAi = categoryFromAi(aiCategory);
  if (fromAi) return { category: fromAi, derivedBy: "ai" };

  return { category: DEFAULT_CATEGORY, derivedBy: "default" };
};

/**
 * Validate a client-supplied category.
 * @param {string} value
 * @returns {boolean}
 */
export const isValidCategory = (value) => asCategory(value) !== null;
