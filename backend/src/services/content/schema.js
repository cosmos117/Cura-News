/**
 * Validation for the AI-written detailed summary, plus the word, paragraph and
 * overlap helpers it relies on. Short summaries use no AI (see shortSummary.js).
 *
 * Zod (not manual validation) so the rules are declarative and unit-testable.
 * Word limits are slightly wider than the prompt's target to tolerate normal
 * model variance; the prompt itself asks for the tighter range.
 */

import { DETAILED_WORDS } from "../../utils/formatDetailedText.js";
import { z } from "zod";
import { tierForWordCount, TIER_FULL, TIER_PARTIAL, TIER_THIN } from "./tiers.js";

export const VALID_TAGS = ["Polity", "Economy", "Defense", "Science", "International"];
export const VALID_CATEGORIES = [
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

/**
 * detailed is null when the source text cannot support a 100-120 word
 * narrative. When present it must be 90-130 words (the prompt asks for 100-120)
 * in exactly 2 paragraphs.
 */
const detailedSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      countWords(value) >= DETAILED_WORDS.min && countWords(value) <= DETAILED_WORDS.max,
    `detailed must be ${DETAILED_WORDS.min}-${DETAILED_WORDS.max} words`,
  )
  .refine(
    (value) => {
      const paragraphs = countParagraphs(value);
      return paragraphs === 2;
    },
    "detailed must contain exactly 2 paragraphs",
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

/** Detailed-only schema, used by the detailed summary service. */
export const detailedContentSchema = z.object({
  detailed: detailedSchema,
  ...classificationSchema,
});

export { tierForWordCount, TIER_FULL, TIER_PARTIAL, TIER_THIN };

