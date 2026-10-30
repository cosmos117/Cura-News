/**
 * Which dashboard feed the reader last chose, "for-you" or "latest".
 *
 * Kept per browser: it is a viewing convenience, and storage can be
 * unavailable (private windows, blocked site data), so every access is
 * guarded and a missing value simply means "use the default".
 */
const FEED_MODE_KEY = "curaFeedMode";

export const readFeedMode = () => {
  try {
    const value = localStorage.getItem(FEED_MODE_KEY);
    return value === "for-you" || value === "latest" ? value : null;
  } catch {
    return null;
  }
};

export const saveFeedMode = (mode) => {
  try {
    localStorage.setItem(FEED_MODE_KEY, mode);
  } catch {
    // Storage unavailable: the choice just is not remembered.
  }
};
