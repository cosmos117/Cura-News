import "../src/config/dotenv.js";
import Parser from "rss-parser";
import { config } from "../src/config/env.js";
import { FEED_SOURCES } from "../src/config/feeds.js";

const parser = new Parser({
  timeout: config.FETCH_TIMEOUT_MS,
  headers: { "User-Agent": "CURA-News/1.0 (+https://github.com/cosmos117/Cura-News)" },
});

for (const source of FEED_SOURCES) {
  for (const feed of source.feeds) {
    if (!feed.enabled) {
      console.log(`${feed.feedId}: DISABLED - ${feed.note || "disabled"}`);
      continue;
    }
    try {
      const result = await parser.parseURL(feed.url);
      const items = result.items || [];
      const descriptions = items
        .map((item) => String(item.contentSnippet || item.content || item.summary || "").replace(/\s+/g, " ").trim().length)
        .filter(Boolean);
      const newest = items
        .map((item) => new Date(item.isoDate || item.pubDate || 0))
        .sort((a, b) => b - a)[0];
      console.log(JSON.stringify({
        feedId: feed.feedId,
        source: source.name,
        status: "OK",
        itemCount: items.length,
        newestItemDate: newest?.getTime() ? newest.toISOString() : null,
        averageDescriptionLength: descriptions.length
          ? Math.round(descriptions.reduce((sum, value) => sum + value, 0) / descriptions.length)
          : 0,
        includesFullContent: items.some((item) => String(item.content || "").length > String(item.contentSnippet || "").length),
      }));
    } catch (error) {
      console.log(JSON.stringify({ feedId: feed.feedId, source: source.name, status: "FAILED", error: error.message }));
    }
  }
}
