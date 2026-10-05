import News from "../models/News.js";
import { config } from "../config/env.js";
import { generateStructured } from "./aiService.js";
import { extractArticleText } from "./articleTextExtractor.js";

const VALID_CATEGORIES = [
  "Politics",
  "Business",
  "Sports",
  "Tech",
  "World",
  "Entertainment",
  "Other",
];
const VALID_TAGS = [
  "Polity",
  "Economy",
  "Defense",
  "Science",
  "International",
];

const SYSTEM_PROMPT = `You are a careful news explainer for an Indian news aggregator, useful for students and civil-service aspirants.
Rules:
1. Use ONLY facts in the provided text. No outside facts, no speculation, no invented numbers, dates or quotes.
2. Write in your own words. Never copy sentences from the source.
3. Stay neutral and factual. No opinions or loaded language.
4. Keep names, numbers, dates and places exactly as given.
5. If the text is too thin for 8 sentences, write fewer and set confidence to "low". Never pad.
6. Output ONLY valid JSON matching the requested schema.`;

const countWords = (value) => value.trim().split(/\s+/).filter(Boolean).length;
const countSentences = (value) =>
  value.split(/[.!?]+(?=\s|$)/).map((part) => part.trim()).filter(Boolean)
    .length;

const normalizeOutput = (output) => {
  if (!output || typeof output !== "object") {
    throw new Error("Detailed AI output must be an object");
  }
  const detailedSummary = String(output.detailedSummary || "").trim();
  const heading = String(output.heading || "").trim();

  if (!heading || heading.length > 120) {
    throw new Error("Detailed heading must be non-empty and at most 120 characters");
  }
  const sentenceCount = countSentences(detailedSummary);
  const wordCount = countWords(detailedSummary);
  if (sentenceCount < 5 || sentenceCount > 14) {
    throw new Error("Detailed summary must contain 5-14 sentences");
  }
  if (wordCount < 100 || wordCount > 260) {
    throw new Error("Detailed summary must contain 100-260 words");
  }
  if (!VALID_CATEGORIES.includes(output.category)) {
    throw new Error("Detailed summary returned an invalid category");
  }
  if (!["high", "medium", "low"].includes(output.confidence)) {
    throw new Error("Detailed summary returned an invalid confidence");
  }
  if (
    !Array.isArray(output.syllabusTags) ||
    output.syllabusTags.some((tag) => !VALID_TAGS.includes(tag))
  ) {
    throw new Error("Detailed summary returned invalid syllabus tags");
  }

  return {
    heading,
    detailedSummary,
    syllabusTags: output.syllabusTags,
    category: output.category,
    confidence: output.confidence,
  };
};

const buildPrompt = ({ source, title, text }) => `Source: ${source}
Title: ${title}
Text: ${text}

Return JSON:
{
  "heading": "string, max 120 chars",
  "detailedSummary": "5-14 factual sentences in 3-4 short paragraphs, preferably 8-12 sentences and 100-260 words",
  "syllabusTags": ["Polity", "Economy", "Defense", "Science", "International"],
  "category": "Politics|Business|Sports|Tech|World|Entertainment|Other",
  "confidence": "high|medium|low"
}`;

const buildRepairPrompt = ({ source, title, text, error }) => `${buildPrompt({
  source,
  title,
  text,
})}

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

  const input = {
    source: article.source,
    title: article.headline,
    text: extracted.text,
  };
  let output;
  try {
    output = normalizeOutput(
      await generateStructured({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildPrompt(input),
      }),
    );
  } catch (firstError) {
    try {
      output = normalizeOutput(
        await generateStructured({
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: buildRepairPrompt({
            ...input,
            error: firstError.message,
          }),
        }),
      );
    } catch (repairError) {
      return {
        status: "FAILED",
        detailSourceType: extracted.sourceType,
        reason: repairError.message,
      };
    }
  }

  if (hasHighSourceOverlap(output.detailedSummary, extracted.text)) {
    return {
      status: "FAILED",
      detailSourceType: extracted.sourceType,
      reason: "Detailed summary was too similar to the source text",
    };
  }

  return {
    status: "DONE",
    detailSourceType: extracted.sourceType,
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
      { $set: { detailedStatus: "PENDING" } },
      { new: true },
    );
    if (!locked) continue;

    const result = await generateDetailedSummary(locked);
    const update = {
      detailedStatus: result.status,
      detailSourceType: result.detailSourceType,
    };
    if (result.status === "DONE") {
      Object.assign(update, {
        headline: result.heading,
        detailedSummary: result.detailedSummary,
        detailedConfidence: result.confidence,
        detailedGeneratedAt: new Date(),
        category: result.category,
        tags: result.syllabusTags.length ? result.syllabusTags : locked.tags,
      });
      completed += 1;
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
