/**
 * Domain constants mirroring the backend enums.
 *
 * `NEWS_CATEGORIES` is the broad topic taxonomy (Politics, Business, ...). It is
 * deliberately separate from `NEWS_TAGS`, which is the UPSC syllabus view
 * (Polity, Economy, Defense, ...). An article can be category "Tech" and tagged
 * "Science" at the same time.
 *
 * Order matters: it drives the topic-card and chip-bar order on the dashboard
 * and must stay in sync with the backend's NEWS_CATEGORIES.
 */

export const NEWS_CATEGORIES = [
  "Politics & Governance",
  "Economy & Business",
  "World Affairs",
  "Defence & Security",
  "Law & Judiciary",
  "Science & Technology",
  "Environment & Climate",
  "Health",
  "Education & Society",
  "Sports",
  "Entertainment",
  "Other",
];
export const TOPIC_LABELS = NEWS_CATEGORIES;

export const NEWS_TAGS = [
  "Polity",
  "Economy",
  "Defense",
  "Science",
  "International",
];

export const NEWS_SOURCES = [
  "The Hindu",
  "Indian Express",
  "Times of India",
];

/**
 * Minimal full-text search length, mirrored from the backend. Typing fewer
 * characters than this would be rejected, so the UI does not send the term at
 * all until the threshold is reached.
 */
export const SEARCH_MIN_LENGTH = 3;

/**
 * Maps a category to its CSS modifier class.
 * @param {string} category - A value from the backend categories enum
 * @returns {string} - The modifier class, or the neutral fallback
 */
export const getCategoryClass = (category) => {
  const slug = String(category || "").toLowerCase();
  return slug ? `cat-${slug}` : "badge--gray";
};

/**
 * Maps a tag to its CSS modifier class.
 * @param {string} tag - A value from the backend tags enum
 * @returns {string} - The modifier class, or the neutral fallback
 */
export const getTagClass = (tag) => {
  const slug = String(tag || "").toLowerCase();
  return slug ? `tag-${slug}` : "badge--gray";
};