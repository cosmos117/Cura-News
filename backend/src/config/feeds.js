/**
 * Feed registry. URLs were verified on 2026-10-04 with HTTP 200 and at least
 * one RSS item. Disabled entries are documented rather than guessed.
 */
export const FEED_SOURCES = [
  {
    id: "the-hindu",
    name: "The Hindu",
    type: "rss",
    feeds: [
      { feedId: "the-hindu-national", section: "National", url: "https://www.thehindu.com/news/national/feeder/default.rss", defaultCategory: "Politics", syllabusHints: ["Polity"], priority: 1, enabled: true },
      { feedId: "the-hindu-latest", section: "Latest", url: "https://www.thehindu.com/feeder/default.rss", defaultCategory: "Other", syllabusHints: [], priority: 2, enabled: true },
    ],
  },
  {
    id: "indian-express",
    name: "Indian Express",
    type: "rss",
    feeds: [
      { feedId: "indian-express-latest", section: "Latest", url: "https://indianexpress.com/feed/", defaultCategory: "Other", syllabusHints: [], priority: 2, enabled: true },
      { feedId: "indian-express-business", section: "Business", url: "https://indianexpress.com/section/business/feed/", defaultCategory: "Business", syllabusHints: ["Economy"], priority: 1, enabled: true },
      { feedId: "indian-express-world", section: "World", url: "https://indianexpress.com/section/world/feed/", defaultCategory: "World", syllabusHints: ["International"], priority: 1, enabled: true },
    ],
  },
  {
    id: "times-of-india",
    name: "Times of India",
    type: "rss",
    feeds: [
      { feedId: "toi-top-stories", section: "Top Stories", url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", defaultCategory: "Other", syllabusHints: [], priority: 2, enabled: true },
      { feedId: "toi-india", section: "India", url: "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms", defaultCategory: "Politics", syllabusHints: ["Polity"], priority: 1, enabled: true },
      { feedId: "toi-world", section: "World", url: "https://timesofindia.indiatimes.com/rssfeeds/296589292.cms", defaultCategory: "World", syllabusHints: ["International"], priority: 1, enabled: true },
    ],
  },
  ];

export const enabledFeeds = () =>
  FEED_SOURCES.flatMap((source) =>
    source.feeds
      .filter((feed) => feed.enabled)
      .map((feed) => ({ ...feed, sourceId: source.id, source: source.name })),
  );
