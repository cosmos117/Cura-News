/**
 * Source-length tiers for article content.
 *
 * The model can only work with the text it is given. RSS feeds almost always
 * hand us just a headline + a ~20-80 word snippet; the full article body is
 * fetched in memory (articleTextExtractor) only for the top-N-per-day and
 * on-demand detailed path. These tiers decide what we ask the AI to produce
 * for a given amount of input, so we never stretch thin text into an 80-word
 * narrative or pad key facts that aren't there.
 *
 *   FULL    - >= 150 words (real article text): summary + keyFacts + detailed.
 *   PARTIAL - 60-149 words (a decent snippet): summary + keyFacts only.
 *   THIN    - < 60 words: a short 1-2 sentence summary, 0-2 key facts.
 *
 * detailed is only ever generated from the FULL tier; PARTIAL/THIN overview
 * calls must return detailed = null and leave detailedStatus = NONE so the
 * dedicated detailed path (which fetches full text) can still attempt it.
 */

export const TIER_FULL = "FULL";
export const TIER_PARTIAL = "PARTIAL";
export const TIER_THIN = "THIN";

export const TIER_THRESHOLDS = {
  FULL: 150,
  PARTIAL: 60,
};

export const TIER_RULES = {
  [TIER_FULL]: {
    detailed: true,
    maxKeyFacts: 5,
    summaryGuide: "2 sentences, 30-45 words",
  },
  [TIER_PARTIAL]: {
    detailed: false,
    maxKeyFacts: 4,
    summaryGuide: "2 sentences, 25-45 words",
  },
  [TIER_THIN]: {
    detailed: false,
    maxKeyFacts: 2,
    summaryGuide: "1-2 short sentences (the source is brief)",
  },
};

/**
 * Classify a word count into a tier.
 * @param {number} wordCount - words of source text given to the model
 * @returns {"FULL"|"PARTIAL"|"THIN"}
 */
export function tierForWordCount(wordCount) {
  const n = Number(wordCount) || 0;
  if (n >= TIER_THRESHOLDS.FULL) return TIER_FULL;
  if (n >= TIER_THRESHOLDS.PARTIAL) return TIER_PARTIAL;
  return TIER_THIN;
}

export default { tierForWordCount, TIER_RULES, TIER_THRESHOLDS };
