import "../src/config/dotenv.js";
import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import News from "../src/models/News.js";
import { classifyArticles } from "../src/services/topicClassifier.js";

const force = process.argv.includes("--force");
try {
  await mongoose.connect(config.MONGO_URI);
  const query = force ? { isPublished: true } : { isPublished: true, topic: { $exists: false } };
  const articles = await News.find(query).lean();
  const classified = await classifyArticles(articles);
  for (const article of classified) {
    await News.updateOne({ _id: article._id }, { $set: {
      topic: article.topic,
      secondaryTopics: article.secondaryTopics,
      topicSource: article.topicSource,
      topicConfidence: article.topicConfidence,
    } });
  }
  console.log(`Backfilled ${classified.length} articles${force ? " (forced)" : ""}.`);
} catch (error) {
  console.error(`Topic backfill failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
