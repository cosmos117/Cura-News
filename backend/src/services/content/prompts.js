/**
 * Prompt for the single-call article content generator (prompt version v2).
 *
 * One call produces headline, summary, keyFacts and detailed together so the
 * model can see all four fields at once and keep them distinct. Field jobs:
 *
 *   summary  - what happened, in the broadest terms.
 *   keyFacts - which specific numbers, names, places, dates and causes matter.
 *   detailed - why it happened, background, impact, what happens next.
 */

import { TIER_FULL, TIER_PARTIAL, TIER_THIN, TIER_RULES } from "./tiers.js";

export const PROMPT_VERSION = "content-v2-2026-10-17";

export const SYSTEM_PROMPT = `You are an expert news analyst writing for a general news aggregator.

Rules:
1. Use ONLY the provided source text. No outside facts, no speculation, no invented numbers, dates or quotes.
2. Write in your own words. Never copy sentences from the source.
3. Neutral and factual. Keep names, numbers, dates and places exactly as given.
4. Each field has a different job. Do not repeat information across fields except the headline-level topic:
   - summary: what happened, in the broadest terms.
   - keyFacts: specific numbers, names, places, dates and causes. Do not repeat the same fact twice and do not reuse sentences from the summary.
   - detailed: why it happened, background, impact, what happens next. It must not begin with, or re-use sentences from, the summary.
5. If the source text does not contain enough distinct information for a field, return fewer key facts (down to 0) and set detailed to null. NEVER pad or repeat.
6. Output ONLY valid JSON matching the requested schema. No markdown, no explanations.`;

export const FIELD_DEFINITIONS = `Fields:
- "headline": rewritten title, at most 120 characters, shown once. Do not copy the source title verbatim if it can be tightened.
- "summary": 2 sentences, 30-45 words. What happened, in broad terms.
- "keyFacts": 0-5 strings, each 4-15 words. ATOMIC FACTS, not full sentences copied from the source or the summary. Each must be a different type of information: a number or amount, a person or organization, a place, a date or timeframe, a cause, or an outcome. They must NOT restate the summary.
- "detailed": null OR a string of 80-100 words in 2-3 short paragraphs (separate paragraphs with a blank line). A NARRATIVE that adds what the summary leaves out: background or context, cause, who is affected, and what happens next - ONLY if stated in the source. If the source is too thin for this, return null.
- "tags": 1-3 values chosen only from Polity, Economy, Defense, Science, International.
- "category": one of Politics, Business, Sports, Tech, World, Entertainment, Other.
- "subtopics": 0-5 short strings.
- "confidence": high, medium or low (how much distinct information the source contained).

Example keyFacts shape (style only, not content): "2.16 million crabs removed in 2025-26", "First detected in Washington in 2016", "$8 million in state funding so far".`;

/**
 * Build a tier-specific directive that tells the model exactly how much to
 * produce for the amount of source text it was given. This is what stops a
 * 40-word RSS snippet from being stretched into an 80-word narrative or padded
 * with invented key facts.
 *
 * @param {"FULL"|"PARTIAL"|"THIN"} tier
 * @returns {string}
 */
export function buildTierDirective(tier) {
  const rules = TIER_RULES[tier] || TIER_RULES[TIER_FULL];

  if (tier === TIER_THIN) {
    return `The source text is BRIEF. Write a short summary of 1-2 sentences. Return at most ${rules.maxKeyFacts} key facts (0 is fine). Always set "detailed" to null - there is not enough material for a narrative.`;
  }

  if (tier === TIER_PARTIAL) {
    return `The source text is LIMITED. Write a 2-sentence summary. Return at most ${rules.maxKeyFacts} key facts. Always set "detailed" to null - do not stretch the short text into a narrative.`;
  }

  return `The source text is FULL. Write a 2-sentence summary, 3-5 key facts, and a "detailed" narrative of 80-100 words in 2-3 paragraphs (or null if the source genuinely lacks material for one).`;
}

/**
 * Build the user prompt for one article.
 * @param {object} params
 * @param {string} params.source - publisher name
 * @param {string} [params.section] - feed section if any
 * @param {string} params.title - source title
 * @param {string} params.text - source text actually available to the model
 * @param {string} [params.tierDirective] - tier-specific sizing directive
 * @param {string} [params.existingSummary] - current summary to avoid (repair calls)
 * @param {string} [params.existingKeyFacts] - current key facts to avoid (repair calls)
 * @param {string} [params.existingDetailed] - current detailed text to avoid (repair calls)
 * @returns {string}
 */
export function buildContentPrompt({
  source,
  section,
  title,
  text,
  tierDirective,
  existingSummary,
  existingKeyFacts,
  existingDetailed,
}) {
  let prompt = `Source: ${source}${section ? ` | Section: ${section}` : ""}
Title: ${title}
Source text:
"""
${text}
"""

${tierDirective ? `${tierDirective}\n\n` : ""}${FIELD_DEFINITIONS}

Return exactly one JSON object with this shape:
{
  "headline": "string, at most 120 chars",
  "summary": "2 sentences, 30-45 words",
  "keyFacts": ["atomic fact, 4-15 words", "..."],
  "detailed": "90-120 words in 2-3 paragraphs, or null",
  "tags": ["Polity|Economy|Defense|Science|International"],
  "category": "Politics|Business|Sports|Tech|World|Entertainment|Other",
  "subtopics": ["..."],
  "confidence": "high|medium|low"
}`;

  if (existingSummary || existingKeyFacts?.length || existingDetailed) {
    prompt += `

Your previous output was rejected for overlapping with itself or the headline. Rewrite ALL fields so they are distinct. Do NOT reuse any of this text:
Previous summary: ${existingSummary || "(none)"}
Previous key facts: ${(existingKeyFacts || []).join(" | ") || "(none)"}
Previous detailed: ${existingDetailed || "(none)"}`;
  }

  return prompt;
}

export default {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  FIELD_DEFINITIONS,
  buildContentPrompt,
  buildTierDirective,
};
