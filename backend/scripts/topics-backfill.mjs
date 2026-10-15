import "../src/config/dotenv.js";
import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import News from "../src/models/News.js";
import { classifyArticles } from "../src/services/topicClassifier.js";

const force = process.argv.includes("--force");

/**
 * Classify in batches rather than one giant call.
 *
 * classifyArticles sends every rule-undecided article to the AI provider in a
 * single request. Handing it the whole collection produced an unusable prompt
 * (and a failed request) whenever more than a few hundred articles were
 * undecided. Batching keeps each request small enough for the provider and
 * lets a single failed batch still leave the rest classified.
 */
const BATCH_SIZE = 25;

try {
  await mongoose.connect(config.MONGO_URI);

  // `$exists: false` misses documents where `topic` was persisted as null (the
  // schema default), which is exactly the state left behind when the topic
  // fields were nested inside `tags` and silently dropped. Match both.
  const query = force
    ? { isPublished: true }
    : { isPublished: true, $or: [{ topic: null }, { topic: { $exists: false } }] };

  const articles = await News.find(query).lean();
  console.log(`Classifying ${articles.length} articles${force ? " (forced)" : ""}...`);

  let classifiedCount = 0;
  const operations = [];

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const slice = articles.slice(i, i + BATCH_SIZE);
    const classified = await classifyArticles(
      slice.map((a) => ({
        url: a.url || `no-url-${a._id}`,
        headline: a.headline,
        summary: a.summary,
        section: a.section,
        source: a.source,
      })),
    );

    for (const result of classified) {
      if (!result.topic) continue;
      const original = slice.find(
        (s) => (s.url || `no-url-${s._id}`) === result.url,
      );
      if (!original) continue;
      operations.push({
        updateOne: {
          filter: { _id: original._id },
          update: {
            $set: {
              topic: result.topic,
              secondaryTopics: result.secondaryTopics || [],
              topicSource: result.topicSource,
              topicConfidence: result.topicConfidence,
            },
          },
        },
      });
      classifiedCount += 1;
    }

    if (operations.length >= 200) {
      await News.bulkWrite(operations.splice(0), { ordered: false });
    }
  }

  if (operations.length) {
    await News.bulkWrite(operations, { ordered: false });
  }

  console.log(`Backfilled ${classifiedCount} articles${force ? " (forced)" : ""}.`);
} catch (error) {
  console.error(`Topic backfill failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
