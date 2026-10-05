import { generateStructured } from "./aiService.js";
import { TOPICS, TOPIC_IDS, topicById } from "../config/topics.js";

const SECTION_HINTS = {
  sports: "sports",
  business: "economy-business",
  economy: "economy-business",
  world: "world-affairs",
  international: "world-affairs",
  national: "politics-governance",
  india: "politics-governance",
  technology: "science-technology",
  tech: "science-technology",
};

const words = (text) => String(text || "").toLowerCase();
const matches = (text, keyword) => new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);

export const classifyByRules = (article) => {
  const text = words(`${article.headline} ${article.summary}`);
  const scored = TOPICS.filter((topic) => topic.id !== "other").map((topic) => ({
    topic,
    score: topic.includeKeywords.reduce((score, keyword) => score + (matches(text, keyword) ? 1 : 0), 0) -
      topic.excludeKeywords.reduce((score, keyword) => score + (matches(text, keyword) ? 2 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];
  const sectionHint = SECTION_HINTS[words(article.section)];

  if (top?.score >= 2 || (top?.score > 0 && (!second || top.score - second.score >= 1))) {
    return { topic: top.topic.id, secondaryTopics: [], topicSource: "KEYWORD", topicConfidence: top.score >= 2 ? "high" : "medium" };
  }
  if (sectionHint) {
    return { topic: sectionHint, secondaryTopics: [], topicSource: "SECTION", topicConfidence: "low" };
  }
  return null;
};

const fallback = () => ({
  topic: "other",
  secondaryTopics: [],
  topicSource: "AI",
  topicConfidence: "low",
});

export async function classifyArticles(articles) {
  const results = new Map();
  const undecided = [];
  for (const article of articles) {
    const result = classifyByRules(article);
    if (result) results.set(article.url, result);
    else undecided.push(article);
  }
  if (!undecided.length) return articles.map((article) => ({ ...article, ...results.get(article.url) }));

  let payload;
  for (let attempt = 1; attempt <= 2 && !payload; attempt += 1) {
    try {
      payload = await generateStructured({
        systemPrompt: "You classify Indian news articles into exactly one topic from a fixed list. Choose the main subject, not the section. Use only provided text. Output only valid JSON.",
        userPrompt: `${attempt === 2 ? "Repair the previous invalid response. " : ""}Topics and definitions:\n${TOPICS.map((topic) => `${topic.id}: ${topic.definition}`).join("\n")}\n\nArticles:\n${JSON.stringify(undecided.map((article) => ({ id: article.url, title: article.headline, snippet: article.summary, source: article.source, section: article.section })))}\n\nReturn JSON array with id, topic, secondaryTopics, confidence.`,
        maxTokens: Math.max(500, undecided.length * 100),
        temperature: 0.1,
      });
      if (!Array.isArray(payload)) payload = null;
    } catch (error) {
      if (attempt === 2) console.warn(`Topic AI classification failed: ${error.message}`);
    }
  }
  for (const item of undecided) {
    const ai = payload?.find((candidate) => candidate.id === item.url);
    if (!ai || !TOPIC_IDS.includes(ai.topic) || !Array.isArray(ai.secondaryTopics)) results.set(item.url, fallback());
    else results.set(item.url, {
      topic: ai.topic,
      secondaryTopics: ai.secondaryTopics.filter((topic) => TOPIC_IDS.includes(topic) && topic !== ai.topic).slice(0, 2),
      topicSource: "AI",
      topicConfidence: ["high", "medium", "low"].includes(ai.confidence) ? ai.confidence : "low",
    });
  }
  return articles.map((article) => ({ ...article, ...results.get(article.url) }));
}

export const topicLabel = (id) => topicById(id)?.label || "Other";
