/**
 * Single-call article content generator.
 *
 * One AI call returns headline, summary, keyFacts and detailed together so the
 * model can keep the fields distinct (see prompts.js for the field jobs).
 * Gemini primary / Groq fallback is handled by aiService.generateStructured.
 *
 * Validation is the zod schema in schema.js. Overlap validation against the
 * headline and across fields lives in overlap.js (validateContent) and runs
 * after the schema parse.
 */

import { generateStructured } from "../aiService.js";
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildContentPrompt,
  buildTierDirective,
} from "./prompts.js";
import {
  contentSchemaForTier,
  applyTierCaps,
  countWords,
  hasHighNgramOverlap,
} from "./schema.js";
import { tierForWordCount } from "./tiers.js";

/**
 * Generate structured content for one article.
 *
 * The source word count picks a tier (see tiers.js) that decides how much we
 * ask the model for: a 40-word RSS snippet yields a short summary and at most
 * two key facts with no detailed narrative, while full article text unlocks
 * the complete summary + keyFacts + detailed set. This keeps thin input from
 * being stretched or padded.
 *
 * @param {object} params
 * @param {string} params.source - publisher name
 * @param {string} [params.section] - feed section
 * @param {string} params.title - source headline
 * @param {string} params.text - source text available to the model
 * @returns {Promise<object>} validated, tier-capped content plus promptVersion,
 *   sourceWordCount, sourceTier, wantsDetailed and aiUsed for storage/debug.
 */
export async function generateArticleContent({ source, section, title, text }) {
  if (!text || typeof text !== "string" || !text.trim()) {
    throw new Error("Source text is required");
  }

  const sourceWordCount = countWords(text);
  const tier = tierForWordCount(sourceWordCount);
  const tierDirective = buildTierDirective(tier);

  const raw = await generateStructured({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildContentPrompt({
      source,
      section,
      title,
      text,
      tierDirective,
    }),
    maxTokens: 1600,
    temperature: 0.2,
  });

  const parsed = contentSchemaForTier(tier).safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`AI content failed schema validation: ${issues}`);
  }

  const content = applyTierCaps(parsed.data, tier);
  if (
    content.detailed &&
    hasHighNgramOverlap(content.detailed, [
      content.summary,
      ...(content.keyFacts || []),
    ])
  ) {
    throw new Error("AI content failed overlap validation for detailed narrative");
  }

  return {
    ...content,
    promptVersion: PROMPT_VERSION,
    sourceWordCount,
    sourceTier: tier,
    wantsDetailed: tier === "FULL",
    aiUsed: true,
    modelUsed: raw.__aiMeta?.modelUsed || null,
  };
}

export default { generateArticleContent };
