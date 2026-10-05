import Parser from "rss-parser";
import { config } from "../config/env.js";
import { enabledFeeds } from "../config/feeds.js";

const cleanText = (value = "") =>
  String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeUrl = (value) => {
  const url = new URL(value);
  [...url.searchParams.keys()]
    .filter((key) => key.toLowerCase().startsWith("utm_") || ["fbclid", "gclid"].includes(key.toLowerCase()))
    .forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  return url.toString();
};

const normalize = (item, feed) => {
  const headline = cleanText(item.title);
  const feedText = cleanText(
    item.contentSnippet ||
      item.content ||
      item.summary ||
      item.description ||
      item["content:encoded"],
  );
  const summary = feedText || `${headline}. Read the original report at ${feed.source}.`;
  const url = normalizeUrl(item.link);
  if (!headline || !url) return null;

  return {
    headline,
    summary,
    source: feed.source,
    sourceId: feed.sourceId,
    feedId: feed.feedId,
    section: feed.section,
    feedCategory: feed.defaultCategory,
    syllabusHints: feed.syllabusHints,
    feedPriority: feed.priority,
    url,
    publishedAt: new Date(item.isoDate || item.pubDate || Date.now()),
    rssCategory: item.categories?.[0] || null,
  };
};

export async function fetchRssArticles() {
  const feeds = enabledFeeds();
  const articles = [];
  const failures = [];

  for (const feed of feeds) {
    const parser = new Parser({
      timeout: config.FETCH_TIMEOUT_MS,
      headers: { "User-Agent": "CURA-News/1.0 (+https://github.com/cosmos117/Cura-News)" },
    });
    try {
      const result = await parser.parseURL(feed.url);
      articles.push(
        ...result.items.map((item) => normalize(item, feed)).filter(Boolean),
      );
    } catch (error) {
      failures.push({ feedId: feed.feedId, source: feed.source, error: error.message });
      console.error(`RSS fetch failed for ${feed.source}: ${error.message}`);
    }
  }

  const unique = [];
  const seen = new Set();
  for (const article of articles) {
    if (!seen.has(article.url)) {
      seen.add(article.url);
      unique.push(article);
    }
  }

  if (!unique.length && failures.length) {
    throw new Error(`All RSS feeds failed. First error: ${failures[0].error}`);
  }

  return unique;
}
