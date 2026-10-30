/**
 * Domain constants mirroring the backend enums.
 *
 * `NEWS_CATEGORIES` is the single topic taxonomy used throughout the app.
 *
 * Order matters: it drives the topic-card and chip-bar order on the dashboard
 * and must stay in sync with the backend's NEWS_CATEGORIES.
 */

export const NEWS_CATEGORIES = [
  "Politics & Governance",
  "Opinion & Editorial",
  "Economy & Business",
  "Agriculture & Rural",
  "World Affairs",
  "Defence & Security",
  "Law & Judiciary",
  "Science & Technology",
  "Environment & Climate",
  "Health",
  "Education & Society",
  "Culture & Lifestyle",
  "Sports",
  "Entertainment",
  "Misc",
];
export const TOPIC_LABELS = NEWS_CATEGORIES;
export const TOPIC_LABEL_BY_ID = Object.fromEntries(
  NEWS_CATEGORIES.map((label) => [
    label.toLowerCase().replaceAll(" & ", "-").replaceAll(" ", "-"),
    label,
  ]),
);

/** Topic id (as stored in reader preferences) for each category label. */
export const TOPIC_ID_BY_LABEL = Object.fromEntries(
  Object.entries(TOPIC_LABEL_BY_ID).map(([id, label]) => [label, id]),
);

/** Topics offered in the For You picker: every category but the catch-all. */
export const PICKABLE_TOPICS = NEWS_CATEGORIES.filter((label) => label !== "Misc");

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
  const slug = String(category || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `cat-${slug}` : "badge--gray";
};