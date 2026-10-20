import "../src/config/dotenv.js";
import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import News from "../src/models/News.js";
import { formatDetailedText } from "../src/utils/formatDetailedText.js";

const apply = process.argv.includes("--apply");
const preview = (value) => String(value || "").slice(0, 80).replace(/\s+/g, " ");

try {
  await mongoose.connect(config.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const articles = await News.find({
    detailedStatus: "DONE",
    detailedSummary: { $type: "string", $ne: "" },
  }).select("_id headline detailedSummary");

  let changed = 0;
  let invalid = 0;
  for (const article of articles) {
    const result = formatDetailedText(article.detailedSummary);
    if (!result.valid) {
      invalid += 1;
      console.log(`[INVALID] ${article._id} ${article.headline} (${result.reason})`);
      if (apply) {
        await News.updateOne(
          { _id: article._id, detailedStatus: "DONE" },
          { $set: { detailedStatus: "NONE", detailedLockedAt: null } },
        );
      }
      continue;
    }

    if (result.text === article.detailedSummary) continue;
    changed += 1;
    console.log(
      `[${apply ? "UPDATED" : "DRY-RUN"}] ${article._id} ${article.headline}\n` +
        `  before: ${preview(article.detailedSummary)}\n` +
        `  after:  ${preview(result.text)}`,
    );
    if (apply) {
      await News.updateOne(
        { _id: article._id, detailedStatus: "DONE" },
        { $set: { detailedSummary: result.text } },
      );
    }
  }

  console.log(
    `${apply ? "Applied" : "Would apply"} ${changed} formatting changes; ` +
      `${invalid} invalid article(s) ${apply ? "reset to NONE" : "would be reset to NONE"}.`,
  );
} catch (error) {
  console.error(`Detailed-text repair failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
