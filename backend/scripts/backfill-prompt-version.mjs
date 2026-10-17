import mongoose from "mongoose";
import "../src/config/dotenv.js";
import { config } from "../src/config/env.js";
import News from "../src/models/News.js";
import { generateArticleContent } from "../src/services/content/contentGenerator.js";
import { PROMPT_VERSION } from "../src/services/content/prompts.js";

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 0;

await mongoose.connect(config.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
let scanned = 0;
let eligible = 0;
let updated = 0;
try {
  const query = {
    promptVersion: { $ne: PROMPT_VERSION },
    summary: { $exists: true, $ne: "" },
  };
  const cursor = News.find(query).sort({ publishedAt: 1 }).cursor();
  for await (const article of cursor) {
    scanned += 1;
    if (limit && eligible >= limit) break;
    eligible += 1;
    if (dryRun) continue;

    try {
      const content = await generateArticleContent({
        source: article.source,
        section: article.section,
        title: article.headline,
        text: `${article.headline}. ${article.summary}. ${
          article.keyFacts?.join(". ") || ""
        }`,
      });
      await News.updateOne(
        { _id: article._id },
        {
          $set: {
            headline: content.headline,
            summary: content.summary,
            keyFacts: content.keyFacts || [],
            bulletPoints: content.keyFacts || [],
            tags: content.tags,
            category: content.category,
            subtopics: content.subtopics || [],
            promptVersion: content.promptVersion,
            sourceWordCount: content.sourceWordCount,
            sourceTier: content.sourceTier,
            modelUsed: content.modelUsed || article.modelUsed,
          },
        },
      );
      updated += 1;
    } catch (error) {
      console.warn(`${article._id}: skipped: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ scanned, eligible, updated, dryRun, promptVersion: PROMPT_VERSION }));
} finally {
  await mongoose.disconnect();
}
