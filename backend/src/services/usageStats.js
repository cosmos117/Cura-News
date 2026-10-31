/**
 * The public reader count shown on the landing page.
 */

import User from "../models/User.js";

const CACHE_MS = 5 * 60 * 1000;
let cached = null;

/**
 * Cached for a few minutes because the landing page asks on every visit.
 * @returns {Promise<{ readers: number }>}
 */
export const getPublicStats = async () => {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.stats;
  const stats = { readers: await User.countDocuments() };
  cached = { at: Date.now(), stats };
  return stats;
};

/** Forget the cached count (tests). */
export const clearStatsCache = () => {
  cached = null;
};
