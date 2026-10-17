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
      { feedId: "the-hindu-national", section: "National", url: "https://www.thehindu.com/news/national/feeder/default.rss", defaultCategory: "Politics", topicHints: ["Polity"], priority: 1, enabled: true },
      { feedId: "the-hindu-latest", section: "Latest", url: "https://www.thehindu.com/feeder/default.rss", defaultCategory: "Other", topicHints: ["politics-governance", "economy-business", "world-affairs", "science-technology", "sports", "entertainment"], priority: 2, enabled: true },
      { feedId: "the-hindu-sports", section: "Sports", url: "https://www.thehindu.com/sport/feeder/default.rss", defaultCategory: "Sports", topicHints: ["sports"], priority: 1, enabled: true },
      { feedId: "the-hindu-science-tech", section: "Technology", url: "https://www.thehindu.com/sci-tech/feeder/default.rss", defaultCategory: "Tech", topicHints: ["science-technology"], priority: 1, enabled: true },
      { feedId: "the-hindu-entertainment", section: "Entertainment", url: "https://www.thehindu.com/entertainment/feeder/default.rss", defaultCategory: "Entertainment", topicHints: ["entertainment"], priority: 1, enabled: true },
      { feedId: "the-hindu-health", section: "Health", url: "https://www.thehindu.com/sci-tech/health/feeder/default.rss", defaultCategory: "Other", topicHints: ["health"], priority: 1, enabled: true },
      { feedId: "the-hindu-business", section: "Business", url: "https://www.thehindu.com/business/feeder/default.rss", defaultCategory: "Business", topicHints: ["economy-business"], priority: 1, enabled: true },
    ],
  },
  {
    id: "indian-express",
    name: "Indian Express",
    type: "rss",
    feeds: [
      { feedId: "indian-express-latest", section: "Latest", url: "https://indianexpress.com/feed/", defaultCategory: "Other", topicHints: ["politics-governance", "economy-business", "world-affairs", "science-technology", "sports", "entertainment"], priority: 2, enabled: true },
      { feedId: "indian-express-business", section: "Business", url: "https://indianexpress.com/section/business/feed/", defaultCategory: "Business", topicHints: ["economy-business"], priority: 1, enabled: true },
      { feedId: "indian-express-world", section: "World", url: "https://indianexpress.com/section/world/feed/", defaultCategory: "World", topicHints: ["world-affairs"], priority: 1, enabled: true },
      { feedId: "indian-express-sports", section: "Sports", url: "https://indianexpress.com/section/sports/feed/", defaultCategory: "Sports", topicHints: ["sports"], priority: 1, enabled: true },
      { feedId: "indian-express-technology", section: "Technology", url: "https://indianexpress.com/section/technology/feed/", defaultCategory: "Tech", topicHints: ["science-technology"], priority: 1, enabled: true },
      { feedId: "indian-express-entertainment", section: "Entertainment", url: "https://indianexpress.com/section/entertainment/feed/", defaultCategory: "Entertainment", topicHints: ["entertainment"], priority: 1, enabled: true },
      { feedId: "indian-express-health", section: "Health", url: "https://indianexpress.com/section/lifestyle/health/feed/", defaultCategory: "Other", topicHints: ["health"], priority: 1, enabled: true },
    ],
  },
  {
    id: "times-of-india",
    name: "Times of India",
    type: "rss",
    feeds: [
      { feedId: "toi-top-stories", section: "Top Stories", url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", defaultCategory: "Other", topicHints: ["politics-governance", "economy-business", "world-affairs", "science-technology", "sports", "entertainment"], priority: 2, enabled: true },
      { feedId: "toi-india", section: "India", url: "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms", defaultCategory: "Politics", topicHints: ["politics-governance", "law-judiciary", "health", "education-society"], priority: 1, enabled: true },
      { feedId: "toi-world", section: "World", url: "https://timesofindia.indiatimes.com/rssfeeds/296589292.cms", defaultCategory: "World", topicHints: ["world-affairs"], priority: 1, enabled: true },
      { feedId: "toi-sports", section: "Sports", url: "https://timesofindia.indiatimes.com/rssfeeds/4719148.cms", defaultCategory: "Sports", topicHints: ["sports"], priority: 1, enabled: true },
      { feedId: "toi-technology", section: "Technology", url: "https://timesofindia.indiatimes.com/rssfeeds/66949542.cms", defaultCategory: "Tech", topicHints: ["science-technology"], priority: 1, enabled: true },
      { feedId: "toi-entertainment", section: "Entertainment", url: "https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms", defaultCategory: "Entertainment", topicHints: ["entertainment"], priority: 1, enabled: true },
      { feedId: "toi-health", section: "Health", url: "https://timesofindia.indiatimes.com/rssfeeds/3908999.cms", defaultCategory: "Other", topicHints: ["health"], priority: 1, enabled: true },
      { feedId: "toi-business", section: "Business", url: "https://timesofindia.indiatimes.com/rssfeeds/1898055.cms", defaultCategory: "Business", topicHints: ["economy-business"], priority: 1, enabled: true },
    ],
  },
  ];

export const enabledFeeds = () =>
  FEED_SOURCES.flatMap((source) =>
    source.feeds
      .filter((feed) => feed.enabled)
      .map((feed) => ({ ...feed, sourceId: source.id, source: source.name })),
  );
