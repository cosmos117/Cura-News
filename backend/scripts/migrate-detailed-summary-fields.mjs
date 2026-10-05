/**
 * Initialize detailed-summary fields on existing News documents.
 *
 * Run from backend with:
 *   node scripts/migrate-detailed-summary-fields.mjs
 */

import "../src/config/dotenv.js";
import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import News from "../src/models/News.js";

try {
  await mongoose.connect(config.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const updates = await Promise.all([
    News.updateMany(
      { detailedStatus: { $exists: false } },
      { $set: { detailedStatus: "NONE" } },
    ),
    News.updateMany(
      { detailedSummary: { $exists: false } },
      { $set: { detailedSummary: null } },
    ),
    News.updateMany(
      { detailedGeneratedAt: { $exists: false } },
      { $set: { detailedGeneratedAt: null } },
    ),
    News.updateMany(
      { detailSourceType: { $exists: false } },
      { $set: { detailSourceType: null } },
    ),
  ]);

  console.log(
    `Initialized detailed-summary fields across ${updates.reduce(
      (total, result) => total + result.modifiedCount,
      0,
    )} field updates.`,
  );
} catch (error) {
  console.error(`Detailed-summary migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
