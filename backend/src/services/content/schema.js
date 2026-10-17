/**
 * Content schema for AI-generated article fields.
 *
 * One job per field (see prompts.js):
 *   headline  - rewritten title, max 120 chars, shown once under the topic chip
 *   summary   - 2 sentences, 30-45 words: what happened, in broad terms
 *   keyFacts  - 0-5 atomic facts (4-15 words each): specific numbers, names,
 *               places, dates, causes. Never restates the summary.
 *   detailed  - null OR 80-100 words in 2-3 paragraphs: narrative that adds
 *               background, cause and impact. Never reuses summary sentences.
 *
 * Zod (not manual validation) so the rules are declarative and unit-testable.
 * Word limits are slightly wider than the prompt's targets to tolerate normal
 * model variance; the prompt itself asks for the tighter range.
 */

import { z } from "zod";
import {
  TIER_FULL,
  TIER_PARTIAL,
  TIER_THIN,
  TIER_RULES,
  tierForWordCount,
} from "./tiers.js";

export const VALID_TAGS = ["Polity", "Economy", "Defense", "Science", "International"];
export const VALID_CATEGORIES = [
  "Politics",
  "Business",
  "Sports",
  "Tech",
  "World",
  "Entertainment",
  "Other",
];

export const countWords = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

/** Paragraphs are separated by any newline run; models sometimes emit \n not \n\n. */
export const countParagraphs = (value) =>
  String(value || "")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean).length;

const normalizedWords = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

export const ngramOverlap = (left, right, size = 3) => {
  const a = normalizedWords(left);
  const b = normalizedWords(right);
  if (a.length < size || b.length < size) return 0;
  const grams = new Set();
  for (let i = 0; i <= b.length - size; i += 1) {
    grams.add(b.slice(i, i + size).join(" "));
  }
  let matches = 0;
  for (let i = 0; i <= a.length - size; i += 1) {
    if (grams.has(a.slice(i, i + size).join(" "))) matches += 1;
  }
  return matches / Math.max(a.length - size + 1, 1);
};

export const hasHighNgramOverlap = (text, references) =>
  references.some((reference) => ngramOverlap(text, reference) >= 0.2);

/** Summary word bounds per tier. THIN sources cannot support 25 words honestly. */
const SUMMARY_BOUNDS = {
  [TIER_FULL]: { min: 25, max: 50 },
  [TIER_PARTIAL]: { min: 20, max: 50 },
  [TIER_THIN]: { min: 8, max: 50 },
};

const keyFactSchema = z
  .string()
  .trim()
  .refine(
    (value) => countWords(value) >= 3 && countWords(value) <= 18,
    "each key fact must be 3-18 words",
  );

/**
 * detailed is null when the source text cannot support an 80-100 word
 * narrative. When present it must be 80-100 words in 2-3 paragraphs.
 */
const detailedSchema = z
  .string()
  .trim()
  .refine(
    (value) => countWords(value) >= 80 && countWords(value) <= 100,
    "detailed must be 80-100 words",
  )
  .refine(
    (value) => {
      const paragraphs = countParagraphs(value);
      return paragraphs >= 2 && paragraphs <= 3;
    },
    "detailed must contain 2-3 paragraphs",
  )
  .nullable();

/** Classification fields piggyback on the same single call. */
const classificationSchema = {
  tags: z
    .array(z.enum(VALID_TAGS))
    .min(1)
    .max(3)
    .default(["International"]),
  category: z.enum(VALID_CATEGORIES).default("Other"),
  subtopics: z.array(z.string().trim().max(80)).max(5).default([]),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
};

/**
 * Build the article content schema for a source-length tier.
 *
 * The tier decides the summary's minimum length and the key-fact ceiling, so
 * thin input is never forced to pad. `detailed` stays nullable at parse time
 * (a model that adds one on a thin source is not a hard failure); the caller
 * coerces it to null for non-FULL tiers via `applyTierCaps`.
 *
 * @param {"FULL"|"PARTIAL"|"THIN"} tier
 */
export function contentSchemaForTier(tier) {
  const bounds = SUMMARY_BOUNDS[tier] || SUMMARY_BOUNDS[TIER_FULL];
  const maxFacts = TIER_RULES[tier]?.maxKeyFacts ?? 5;

  const summarySchema = z
    .string()
    .trim()
    .refine(
      (value) => {
        const words = countWords(value);
        return words >= bounds.min && words <= bounds.max;
      },
      `summary must be ${bounds.min}-${bounds.max} words`,
    );

  return z.object({
    headline: z
      .string()
      .trim()
      .min(10, "headline must be at least 10 characters")
      .max(120, "headline must be at most 120 characters"),
    summary: summarySchema,
    keyFacts: z.array(keyFactSchema).max(maxFacts, `at most ${maxFacts} key facts`).default([]),
    detailed: detailedSchema.default(null),
    ...classificationSchema,
  });
}

/**
 * Enforce tier caps that are policy, not validation. For PARTIAL/THIN
 * sources we never publish a detailed narrative (the dedicated detailed path
 * will fetch full text and try again), and we trim key facts to the tier cap.
 */
export function applyTierCaps(content, tier) {
  const rules = TIER_RULES[tier] || TIER_RULES[TIER_FULL];
  const capped = { ...content };
  if (!rules.detailed) {
    capped.detailed = null;
  }
  if (Array.isArray(capped.keyFacts) && capped.keyFacts.length > rules.maxKeyFacts) {
    capped.keyFacts = capped.keyFacts.slice(0, rules.maxKeyFacts);
  }
  return capped;
}

/**
 * The default single-call content schema (FULL tier). `detailed` defaults to
 * null so a model that omits it is accepted rather than rejected.
 */
export const articleContentSchema = contentSchemaForTier(TIER_FULL);

/** Detailed-only schema, used by the detailed summary service. */
export const detailedContentSchema = z.object({
  detailed: detailedSchema,
  ...classificationSchema,
});

export { tierForWordCount, TIER_FULL, TIER_PARTIAL, TIER_THIN };

export default articleContentSchema;
