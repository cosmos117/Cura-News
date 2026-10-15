import mongoose from "mongoose";
import "../src/config/dotenv.js";
import { config } from "../src/config/env.js";
import News from "../src/models/News.js";
import { summarizeArticle } from "../src/services/aiService.js";

const dryRun = process.argv.includes("--dry-run");
const resummarize = process.argv.includes("--resummarize");

const normalize = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const words = (value) => normalize(value).split(" ").filter(Boolean);
const containsPhrase = (haystack, needle) =>
  needle && haystack.includes(needle);

const invalidFact = (fact, article) => {
  const factText = normalize(fact);
  if (!factText || /^source\s*:/i.test(fact.trim())) return true;
  const headline = normalize(article.headline);
  const gist = normalize(article.gist);
  const summary = normalize(article.summary);
  if (containsPhrase(headline, factText) || containsPhrase(factText, headline)) return true;
  if (containsPhrase(summary, factText) || containsPhrase(factText, summary)) return true;
  if (containsPhrase(gist, factText) || containsPhrase(factText, gist)) return true;

  const factWords = words(fact);
  const summaryWords = words(article.summary);
  const factNgrams = new Set();
  for (let i = 0; i <= factWords.length - 3; i += 1) {
    factNgrams.add(factWords.slice(i, i + 3).join(" "));
  }
  let overlap = 0;
  for (let i = 0; i <= summaryWords.length - 3; i += 1) {
    if (factNgrams.has(summaryWords.slice(i, i + 3).join(" "))) overlap += 1;
  }
  return overlap >= 2;
};

try {
  await mongoose.connect(config.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const cursor = News.find({}).cursor();
  let scanned = 0;
  let changed = 0;

  for await (const article of cursor) {
    scanned += 1;
    const sourceFacts = article.keyFacts?.length
      ? article.keyFacts
      : article.bulletPoints || [];
    const keyFacts = sourceFacts
      .filter((fact) => !invalidFact(fact, article))
      .slice(0, 5);
    const gist = article.gist || words(article.summary).slice(0, 25).join(" ");
    const update = {
      gist,
      keyFacts,
      bulletPoints: keyFacts,
    };
    const needsUpdate =
      article.gist !== gist ||
      JSON.stringify(article.keyFacts || []) !== JSON.stringify(keyFacts) ||
      JSON.stringify(article.bulletPoints || []) !== JSON.stringify(keyFacts);

    if (!needsUpdate) continue;
    changed += 1;
    console.log(`${dryRun ? "[dry-run] " : ""}${article._id}: ${keyFacts.length} key facts`);
    if (!dryRun) {
      if (resummarize && changed <= config.AI_DAILY_LIMIT) {
        try {
          const result = await summarizeArticle(
            `${article.headline}. ${article.summary}`,
          );
          update.gist = result.gist;
          update.keyFacts = result.keyFacts || [];
          update.bulletPoints = update.keyFacts;
          update.summary = result.summary;
        } catch (error) {
          console.warn(`${article._id}: re-summarization skipped: ${error.message}`);
        }
      }
      await News.updateOne({ _id: article._id }, { $set: update });
    }
  }

  console.log(JSON.stringify({ scanned, changed, dryRun, resummarize }));
  if (resummarize && changed > config.AI_DAILY_LIMIT) {
    console.warn(`AI daily quota reached after ${config.AI_DAILY_LIMIT} articles; remaining records were only cleaned.`);
  }
} finally {
  await mongoose.disconnect();
}
