import News from "../models/News.js";
import { config } from "../config/env.js";
import { generateStructured } from "./aiService.js";
import { extractArticleText } from "./articleTextExtractor.js";
import { PROMPT_VERSION } from "./content/prompts.js";
import {
  detailedContentSchema,
  hasHighNgramOverlap,
} from "./content/schema.js";
import { tierForWordCount, TIER_FULL } from "./content/tiers.js";

const SYSTEM_PROMPT = `You are a careful news explainer for a general news aggregator read by a broad audience.
Rules:
1. Use ONLY facts in the provided text. No outside facts, no speculation, no invented numbers, dates or quotes.
2. Write in your own words. Never copy sentences from the source.
3. Stay neutral and factual. No opinions or loaded language.
4. Keep names, numbers, dates and places exactly as given.
5. The detailed narrative has a different job than the short summary and key facts provided below: it explains why it happened, background and context, who is affected, and what happens next - ONLY where the source states it. It must not begin with, or re-use sentences from, the summary.
6. If the extracted article is too thin for an 80-100 word narrative, set "detailed" to null. Never pad or repeat.
7. Output ONLY valid JSON matching the requested schema.`;

const countWords = (value) => value.trim().split(/\s+/).filter(Boolean).length;

const normalizeParagraphs = (value) =>
  value
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n");

const normalizeOutput = (output) => {
  if (!output || typeof output !== "object") {
    throw new Error("Detailed AI output must be an object");
  }

  const parsed = detailedContentSchema.safeParse(output);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`${issue.path.join(".") || "output"}: ${issue.message}`);
  }
  if (parsed.data.detailed === null) {
    throw new Error("Detailed narrative was null (source text too thin)");
  }

  return {
    ...parsed.data,
    detailed: normalizeParagraphs(parsed.data.detailed),
  };
};

const buildPrompt = ({ source, title, text, summary, keyFacts }) => `Source: ${source}
Title: ${title}
Text: ${text}

The article already has this short summary and these key facts. Your narrative MUST add what they leave out (background, cause, impact, what happens next) and MUST NOT repeat their sentences:
Summary: ${summary || "(none)"}
Key facts: ${keyFacts?.length ? keyFacts.join(" | ") : "(none)"}

Return JSON:
{
  "detailed": "80-100 words in 2-3 short paragraphs (separate paragraphs with a blank line), or null if the text is too thin",
  "tags": ["Polity", "Economy", "Defense", "Science", "International"],
  "category": "Politics|Business|Sports|Tech|World|Entertainment|Other",
  "confidence": "high|medium|low"
}`;

const buildRepairPrompt = (input, error) => `${buildPrompt(input)}

Your previous output failed validation because: ${error}
Return only corrected JSON.`;

const hasHighSourceOverlap = (summary, sourceText) => {
  const sourceWords = sourceText.toLowerCase().split(/\s+/);
  const summaryWords = summary.toLowerCase().split(/\s+/);
  const sourceNgrams = new Set();
  for (let i = 0; i <= sourceWords.length - 8; i += 1) {
    sourceNgrams.add(sourceWords.slice(i, i + 8).join(" "));
  }
  let matches = 0;
  const summaryNgramCount = Math.max(summaryWords.length - 7, 1);
  for (let i = 0; i <= summaryWords.length - 8; i += 1) {
    if (sourceNgrams.has(summaryWords.slice(i, i + 8).join(" "))) matches += 1;
  }
  return matches >= 3 && matches / summaryNgramCount >= 0.15;
};

const todayStart = () => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start;
};

export async function generateDetailedSummary(article) {
  const extracted = await extractArticleText(article.url);
  if (!extracted.available) {
    return {
      status: "UNAVAILABLE",
      detailSourceType: extracted.sourceType,
      reason: extracted.reason,
    };
  }

  // The dedicated detailed path fetches the full article page, but if the
  // A readable page must contain enough material for an honest 80-100 word
  // narrative. The extractor has already parsed the full article page.
  const extractedWordCount = countWords(extracted.text);
  if (extractedWordCount < 120) {
    return {
      status: "UNAVAILABLE",
      detailSourceType: extracted.sourceType,
      reason: `Source text too thin for detailed narrative (${extractedWordCount} words, need >= 120)`,
    };
  }

  // The narrative must add to, not repeat, what the Overview tab already
  // shows, so the existing summary and key facts go into the prompt.
  const input = {
    source: article.source,
    title: article.headline,
    text: extracted.text,
    summary: article.summary,
    keyFacts: article.keyFacts?.length ? article.keyFacts : article.bulletPoints,
  };
  let output;
  let modelUsed = null;
  try {
    const rawOutput = await generateStructured({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildPrompt(input),
    });
    output = normalizeOutput(rawOutput);
    modelUsed = rawOutput.__aiMeta?.modelUsed || null;
  } catch (firstError) {
    try {
      const rawRepairOutput = await generateStructured({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildRepairPrompt(input, firstError.message),
      });
      output = normalizeOutput(rawRepairOutput);
      modelUsed = rawRepairOutput.__aiMeta?.modelUsed || null;
    } catch (repairError) {
      return {
        status: "FAILED",
        detailSourceType: extracted.sourceType,
        reason: repairError.message,
      };
    }
  }

  if (hasHighSourceOverlap(output.detailed, extracted.text)) {
    return {
      status: "FAILED",
      detailSourceType: extracted.sourceType,
      reason: "Detailed summary was too similar to the source text",
    };
  }
  if (
    hasHighNgramOverlap(output.detailed, [
      article.summary,
      ...(article.keyFacts?.length ? article.keyFacts : article.bulletPoints || []),
    ])
  ) {
    return {
      status: "FAILED",
      detailSourceType: extracted.sourceType,
      reason: "Detailed summary repeated the stored summary or key facts",
    };
  }

  return {
    status: "DONE",
    detailSourceType: extracted.sourceType,
    promptVersion: PROMPT_VERSION,
    sourceWordCount: extractedWordCount,
    sourceTier: tierForWordCount(extractedWordCount),
    modelUsed,
    ...output,
  };
}

export async function dailyDetailedCount() {
  return News.countDocuments({
    detailedStatus: "DONE",
    detailedGeneratedAt: { $gte: todayStart() },
  });
}

export async function generateTopDetailedSummaries() {
  const remaining = Math.max(
    0,
    detailedConfig.DETAILED_TOP_N - (await dailyDetailedCount()),
  );
  if (remaining === 0) return { attempted: 0, completed: 0 };

  const candidates = await News.find({
    isPublished: true,
    date: { $gte: todayStart() },
    detailedStatus: "NONE",
    url: { $exists: true, $ne: "" },
  })
    .sort({ date: -1 })
    .limit(remaining)
    .exec();

  let completed = 0;
  for (const article of candidates) {
    const locked = await News.findOneAndUpdate(
      { _id: article._id, detailedStatus: "NONE" },
      { $set: { detailedStatus: "PENDING", detailedLockedAt: new Date() } },
      { new: true },
    );
    if (!locked) continue;

    let result;
    try {
      result = await generateDetailedSummary(locked);
    } catch (error) {
      result = {
        status: "FAILED",
        detailSourceType: "SNIPPET_ONLY",
        reason: error.message,
      };
    } finally {
      // The status update below is deliberately kept in the same loop so an
      // exception can never leave a lock in PENDING indefinitely.
    }
    const update = {
      detailedStatus: result.status,
      detailSourceType: result.detailSourceType,
      detailedLockedAt: null,
    };
    if (result.status === "DONE") {
      Object.assign(update, {
        detailedSummary: result.detailed,
        detailedConfidence: result.confidence,
        detailedGeneratedAt: new Date(),
        modelUsed: result.modelUsed || locked.modelUsed,
        category: result.category,
        // v2: the headline is owned by the ingestion-time call; the detailed
        // narrative only refines tags/category, never the title.
        tags: result.tags?.length ? result.tags : locked.tags,
        promptVersion: result.promptVersion,
        sourceWordCount: result.sourceWordCount,
        lastError: null,
      });
      if (result.sourceTier) update.sourceTier = result.sourceTier;
      completed += 1;
    } else if (result.status === "FAILED") {
      // Persist the reason so the audit script can group failures instead of
      // showing 128 identical "(none)" rows.
      update.lastError = String(
        result.reason || "Detailed summary generation failed",
      ).slice(0, 500);
    } else if (result.status === "UNAVAILABLE") {
      // Thin or blocked source: mark unavailable and record why so the article
      // is not retried endlessly.
      update.lastError = String(
        result.reason ||
          "Detailed summary is unavailable. Read the full story at the source.",
      ).slice(0, 500);
    }
    await News.findByIdAndUpdate(article._id, update, {
      runValidators: true,
    });
    if (config.AI_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.AI_DELAY_MS));
    }
  }

  return { attempted: candidates.length, completed };
}

export const detailedConfig = config;
