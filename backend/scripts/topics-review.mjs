import "../src/config/dotenv.js";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import News from "../src/models/News.js";
import { TOPICS } from "../src/config/topics.js";
import { classifyByRules } from "../src/services/topicClassifier.js";

const outputPath = path.resolve("topic-review.json");
const limit = 50;

try {
  await mongoose.connect(config.MONGO_URI);
  const [total, byTopic, otherTitles] = await Promise.all([
    News.countDocuments({ isPublished: true }),
    News.aggregate([
      { $match: { isPublished: true } },
      { $group: { _id: "$topic", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    News.find({ isPublished: true, topic: "other" })
      .sort({ date: -1 })
      .limit(limit)
      .select("_id headline summary source section topicSource topicConfidence")
      .lean(),
  ]);

  const review = otherTitles.map((article) => ({
    id: String(article._id),
    headline: article.headline,
    source: article.source,
    section: article.section || null,
    currentTopic: article.topic,
    currentSource: article.topicSource || null,
    ruleSuggestion: classifyByRules(article)?.topic || null,
  }));
  const counts = Object.fromEntries(byTopic.map((row) => [row._id || "unclassified", row.count]));
  const otherCount = counts.other || 0;
  const report = {
    generatedAt: new Date().toISOString(),
    totalPublished: total,
    classified: total - (counts.unclassified || 0),
    otherCount,
    otherPercent: total ? Number(((otherCount / total) * 100).toFixed(2)) : 0,
    topicCounts: Object.fromEntries(
      TOPICS.map((topic) => [topic.id, counts[topic.id] || 0]),
    ),
    review,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${review.length} review titles to ${outputPath}`);
} catch (error) {
  console.error(`Topic review failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
