import "../src/config/dotenv.js";
import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import News from "../src/models/News.js";

try {
  await mongoose.connect(config.MONGO_URI);
  const result = await News.updateMany(
    { topic: { $exists: false } },
    { $set: { secondaryTopics: [] } },
  );
  console.log(`Topic migration checked ${result.matchedCount} existing articles.`);
} catch (error) {
  console.error(`Topic migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
