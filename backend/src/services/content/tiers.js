/**
 * Source-length tiers for the text a detailed summary is written from.
 *
 *   FULL    - >= 150 words (real article text)
 *   PARTIAL - 60-149 words (a decent snippet)
 *   THIN    - < 60 words
 *
 * The tier is stored with each detailed summary as `sourceTier`.
 */

export const TIER_FULL = "FULL";
export const TIER_PARTIAL = "PARTIAL";
export const TIER_THIN = "THIN";

export const TIER_THRESHOLDS = {
  FULL: 150,
  PARTIAL: 60,
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

export default { tierForWordCount, TIER_THRESHOLDS };
