import "../src/config/dotenv.js";
import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import News from "../src/models/News.js";

try {
  await mongoose.connect(config.MONGO_URI);
  const sample = await News.aggregate([{ $match: { topic: { $exists: true } } }, { $sample: { size: 30 } }, { $project: { headline: 1, topic: 1, topicSource: 1, topicConfidence: 1 } }]);
  sample.forEach((article) => console.log(JSON.stringify(article)));
} catch (error) {
  console.error(`Topic sample failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
