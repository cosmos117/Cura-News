import "../src/config/dotenv.js";
import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import News from "../src/models/News.js";
import { TOPIC_LABELS } from "../src/config/topics.js";

try {
  await mongoose.connect(config.MONGO_URI);
  const rows = await News.aggregate([{ $match: { isPublished: true } }, { $group: { _id: "$topic", count: { $sum: 1 } } }]);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  rows.forEach((row) => console.log(`${TOPIC_LABELS[row._id] || row._id || "Unclassified"}: ${row.count}`));
  const other = rows.find((row) => row._id === "other")?.count || 0;
  console.log(`Other: ${total ? ((other / total) * 100).toFixed(1) : "0.0"}%`);
  if (total && other / total > 0.1) console.warn("FLAG: Other exceeds 10%");
  const breakdown = await News.aggregate([
    { $match: { isPublished: true } },
    { $group: { _id: { source: "$source", section: "$section", topicSource: "$topicSource" }, count: { $sum: 1 } } },
    { $sort: { "_id.source": 1, "_id.section": 1 } },
  ]);
  console.log("Source / section / classifier:");
  breakdown.forEach((row) => console.log(`${row._id.source || "Unknown"} / ${row._id.section || "Unknown"} / ${row._id.topicSource || "Unknown"}: ${row.count}`));
} catch (error) {
  console.error(`Topic report failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
