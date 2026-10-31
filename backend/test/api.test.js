/**
 * End-to-end tests against an in-memory MongoDB.
 *
 * Exercises the routes and the bugs that were fixed, using the real Express
 * app (no mocks). The tests run in order and share the seeded data, so they
 * stay in one file. Run with: npm test
 */

import { test } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";
import assert from "node:assert/strict";
import axios from "axios";

let baseUrl;

const api = async (path, { method = "GET", token, body, headers = {} } = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, data };
};

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri("cura-news-test");
process.env.JWT_SECRET = "test-secret-that-is-definitely-long-enough-32";
process.env.NODE_ENV = "test";
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.CRON_SECRET = "test-cron-secret";
// Pinned explicitly: dotenv does not override already-set vars, so these win
// over any local .env and the assertions below stay deterministic.
process.env.AI_PROVIDER = "gemini";
// One model per provider keeps the scheduling tests readable; the pool
// tests set longer lists for their own duration.
process.env.GEMINI_MODELS = "gemini-3.8-flash";
process.env.GROQ_MODELS = "openai/gpt-oss-120b";
// Fake AI keys: both providers count as configured, but nothing in the suite
// can spend real quota. Tests that need AI replies stub axios.post.
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.GROQ_API_KEY = "test-groq-key";
process.env.GEMINI_RPM = "10";
process.env.GROQ_RPM = "30";
// Page fetching is off for the whole run, so the background pipeline started
// by the admin ingest test never touches the real sites. The tests that need
// it switch it on for their own duration.
process.env.SUMMARY_PAGE_FETCH = "false";

const { connectDB, disconnectDB } = await import("../src/config/database.js");
await connectDB();

const app = (await import("../src/app.js")).default;
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
baseUrl = `http://127.0.0.1:${server.address().port}/api`;

const News = (await import("../src/models/News.js")).default;

const { istDayKey } = await import("../src/utils/date.js");
const newsProcessor = (await import("../src/services/newsProcessor.js")).default;
// Ensure indexes (notably the text index behind /news/search) exist before
// any request is made; autoIndex otherwise builds them in the background and
// the first $text query 500s.
await News.init();

// ---------- seed ----------
const article = await News.create({
  source: "The Hindu",
  headline: "Union Cabinet approves new education policy reform",
  summary:
    "The Union Cabinet approved a sweeping reform of the national education policy, allocating additional funding for secondary schools and revising the curriculum framework.",
  bulletPoints: [
    "Additional funding allocated for secondary schools",
    "Curriculum framework revised across three stages",
    "New teacher certification process begins next year",
  ],
  tags: ["Polity", "Economy"],
  subtopics: ["Education Policy"],
  url: "https://example.com/education-policy",
  date: new Date(),
  isPublished: true,
});

const articleId = article._id.toString();

await test("cleanup deletes old articles but keeps today's articles", async () => {
  const old = await News.create({
    source: "Times of India",
    headline: "Old article outside the current retention day",
    summary: "This seeded article is deliberately dated before the current day so cleanup must remove it.",
    bulletPoints: ["old", "retention", "cleanup"],
    tags: ["Economy"],
    publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    publishedDayKey: "2000-01-01",
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  });
  const current = await News.create({
    source: "Times of India",
    headline: "Today's article remains after retention cleanup",
    summary: "This seeded article belongs to the current IST day and must remain after cleanup runs.",
    bulletPoints: ["today", "retention", "cleanup"],
    tags: ["Economy"],
    publishedAt: new Date(),
    publishedDayKey: istDayKey(),
    date: new Date(),
  });

  await newsProcessor._cleanupOldNews();
  assert.equal(await News.exists({ _id: old._id }), null);
  assert.ok(await News.exists({ _id: current._id }));
  await News.deleteOne({ _id: current._id });
});

await test("article extractor proceeds when robots returns 403, timeout, or null", async () => {
  const { extractArticleText, resetRobotsCache } = await import("../src/services/articleTextExtractor.js");
  const originalGet = axios.get;
  const html = `<html><body><article>${"Readable article text ".repeat(100)}</article></body></html>`;
  try {
    for (const robotsResult of [
      { status: 403, data: "" },
      new Error("timeout"),
      null,
    ]) {
      // robots.txt is cached per site, so each case starts with a clean cache.
      resetRobotsCache();
      let call = 0;
      axios.get = async () => {
        call += 1;
        if (call === 1) {
          if (robotsResult instanceof Error) throw robotsResult;
          return robotsResult;
        }
        return { data: html };
      };
      const result = await extractArticleText("https://example.com/article");
      assert.equal(result.available, true);
    }
  } finally {
    axios.get = originalGet;
  }
});

await test("detailed summary fields default safely", async () => {
  assert.equal(article.detailedStatus, "NONE");
  assert.equal(article.detailedSummary, null);
  assert.equal(article.detailSourceType, undefined);
});

// ---------- AI provider scheduling ----------
// axios.post is stubbed here: `aiReplies[provider]` returns a reply or
// throws, and `aiCalls` records which provider each request went to.
const aiService = await import("../src/services/aiService.js");
const { config: aiEnv } = await import("../src/config/env.js");
const originalAxiosPost = axios.post;
const aiCalls = [];
const aiBodies = [];
let aiReplies = {};
const providerOf = (url) => (String(url).includes("groq.com") ? "groq" : "gemini");
const aiReply = (provider, json, headers = {}) =>
  provider === "groq"
    ? { data: { choices: [{ message: { content: JSON.stringify(json) } }] }, headers }
    : { data: { candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }, headers };
const httpError = (status, data = {}, headers = {}) => {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = { status, data, headers };
  return error;
};
// What Gemini's free tier actually answers once its 20 requests/day are used.
const geminiDailyQuotaUsed = () => {
  throw httpError(429, {
    error: {
      code: 429,
      message: "You exceeded your current quota. Please retry in 18h8m30.31s.",
      details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "65310s" }],
    },
  });
};
const groqRateLimited = (seconds) => () => {
  throw httpError(429, { error: { message: "Rate limit reached" } }, { "retry-after": String(seconds) });
};
const askAi = (priority) =>
  aiService.generateStructured({ systemPrompt: "s", userPrompt: "u", maxTokens: 100, priority });
const stubAi = (replies) => {
  aiService.resetAiRateState();
  aiCalls.length = 0;
  aiReplies = replies;
  axios.post = async (url, body) => {
    const provider = providerOf(url);
    aiCalls.push(provider);
    aiBodies.push({ provider, body });
    if (!aiReplies[provider]) throw httpError(500, { error: { message: "no stub" } });
    return aiReplies[provider]();
  };
};
const unstubAi = () => {
  axios.post = originalAxiosPost;
  aiService.resetAiRateState();
};

await test("a Gemini 429 does not block Groq, and Gemini's retry hint is honoured", async () => {
  stubAi({ gemini: geminiDailyQuotaUsed, groq: () => aiReply("groq", { ok: 1 }) });
  try {
    const first = await askAi("interactive");
    assert.equal(first.ok, 1);
    assert.equal(first.__aiMeta.provider, "groq");
    assert.equal(first.__aiMeta.modelUsed, "openai/gpt-oss-120b");
    assert.deepEqual(aiCalls, ["gemini", "groq"]);
    // At default effort gpt-oss can spend its whole output budget reasoning
    // and return an empty answer.
    assert.equal(aiBodies.at(-1).body.reasoning_effort, "low");

    // Before the fix, every call here failed for 60s without trying Groq.
    aiCalls.length = 0;
    await askAi("interactive");
    await askAi("background");
    assert.deepEqual(aiCalls, ["groq", "groq"], "Gemini stays paused for its 18h hint");
  } finally {
    unstubAi();
  }
});

await test("a reader is not kept waiting when every provider is rate-limited for long", async () => {
  stubAi({ gemini: geminiDailyQuotaUsed, groq: groqRateLimited(450) });
  try {
    const started = Date.now();
    await assert.rejects(askAi("interactive"), (error) => {
      assert.equal(error.statusCode, 429);
      assert.ok(
        error.retryAfterMs > 440_000 && error.retryAfterMs <= 450_000,
        `retryAfterMs should follow Groq's 450s hint, got ${error.retryAfterMs}`,
      );
      return true;
    });
    assert.ok(Date.now() - started < 2000, "must answer at once, not wait out the cooldown");
    assert.equal(aiService.getAiAvailability("interactive").available, false);
  } finally {
    unstubAi();
  }
});

await test("a short provider cooldown is waited out for a reader", async () => {
  let groqCalls = 0;
  stubAi({
    gemini: geminiDailyQuotaUsed,
    groq: () => {
      groqCalls += 1;
      if (groqCalls === 1) groqRateLimited(1)();
      return aiReply("groq", { ok: 2 });
    },
  });
  try {
    const result = await askAi("interactive");
    assert.equal(result.ok, 2);
    assert.equal(groqCalls, 2);
  } finally {
    unstubAi();
  }
});

await test("background work leaves Groq's token reserve for readers", async () => {
  stubAi({
    gemini: geminiDailyQuotaUsed,
    groq: () =>
      aiReply("groq", { ok: 3 }, {
        "x-ratelimit-limit-tokens": "8000",
        "x-ratelimit-remaining-tokens": "2000",
        "x-ratelimit-reset-tokens": "1m0s",
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "900",
        "x-ratelimit-reset-requests": "2h24m",
      }),
  });
  try {
    await askAi("interactive");
    // 2,000 tokens left, refilling 6,000 per minute. A reader may use them
    // now; background must wait until the 4,000-token reserve is back.
    assert.equal(aiService.getAiAvailability("interactive").retryAfterMs, 0);
    const background = aiService.getAiAvailability("background").retryAfterMs;
    assert.ok(
      background > 15_000 && background <= 20_000,
      `background should wait ~20s for the reserve, got ${background}`,
    );
  } finally {
    unstubAi();
  }
});

await test("CORS_ORIGIN tolerates trailing slashes, spaces and lists", async () => {
  const { parseAllowedOrigins } = await import("../src/middleware/corsMiddleware.js");
  assert.deepEqual(parseAllowedOrigins("https://cura-news.vercel.app/"), ["https://cura-news.vercel.app"]);
  assert.deepEqual(
    parseAllowedOrigins(" https://a.vercel.app/ ,http://localhost:3000, ,https://b.example.com// "),
    ["https://a.vercel.app", "http://localhost:3000", "https://b.example.com"],
  );
  assert.deepEqual(parseAllowedOrigins(""), []);
});

// ---------- model pool ----------
// A per-model stub: replies[model] returns a reply or throws. `poolCalls`
// records "provider:model" for every request in order.
const poolCalls = [];
const poolBodies = [];
const stubPool = (replies) => {
  aiService.resetAiRateState();
  poolCalls.length = 0;
  poolBodies.length = 0;
  axios.post = async (url, body) => {
    const provider = providerOf(url);
    const model = provider === "groq" ? body.model : String(url).match(/models\/([^:]+):/)[1];
    poolCalls.push(`${provider}:${model}`);
    poolBodies.push({ model, body });
    if (!replies[model]) throw httpError(500, { error: { message: "no stub" } });
    return replies[model](body);
  };
};
const withPool = async (models, run) => {
  const saved = { gemini: aiEnv.GEMINI_MODELS, groq: aiEnv.GROQ_MODELS };
  aiEnv.GEMINI_MODELS = models.gemini;
  aiEnv.GROQ_MODELS = models.groq;
  try {
    await run();
  } finally {
    aiEnv.GEMINI_MODELS = saved.gemini;
    aiEnv.GROQ_MODELS = saved.groq;
    unstubAi();
  }
};

await test("the pool moves on to the next model when one runs out, and skips models that are gone", async () => {
  await withPool({ gemini: "gm-a,gm-b", groq: "gq-gone,gq-ok" }, async () => {
    let gmBLeft = 1;
    stubPool({
      "gm-a": geminiDailyQuotaUsed,
      "gm-b": () => (gmBLeft-- > 0 ? aiReply("gemini", { ok: "b" }) : geminiDailyQuotaUsed()),
      "gq-gone": () => {
        throw httpError(404, { error: { code: "model_not_found", message: "The model `gq-gone` does not exist" } });
      },
      "gq-ok": () => aiReply("groq", { ok: "groq" }),
    });

    const first = await askAi("interactive");
    assert.equal(first.ok, "b");
    assert.equal(first.__aiMeta.modelUsed, "gm-b");
    assert.deepEqual(poolCalls, ["gemini:gm-a", "gemini:gm-b"]);

    poolCalls.length = 0;
    const second = await askAi("interactive");
    assert.equal(second.ok, "groq", "gm-b's quota is now used up too");
    assert.deepEqual(poolCalls, ["gemini:gm-b", "groq:gq-gone", "groq:gq-ok"], "gm-a stays paused");

    poolCalls.length = 0;
    await askAi("interactive");
    assert.deepEqual(poolCalls, ["groq:gq-ok"], "spent and missing models are skipped");

    const usage = aiService.getAiUsage();
    assert.equal(usage["gemini:gm-a"].rateLimited, 1);
    assert.equal(usage["groq:gq-gone"].failed, 1);
    assert.equal(usage["groq:gq-ok"].ok, 2);
  });
});

await test("each model gets the request options it accepts", async () => {
  await withPool(
    { gemini: "gm-flash,gemini-x-flash-lite", groq: "openai/gpt-oss-20b,qwen/qwen3.8-27b" },
    async () => {
      let liteSeen = false;
      stubPool({
        // Rejects the "thinking off" setting, like gemini-3.5-flash-lite does.
        "gm-flash": (body) => {
          if (body.generationConfig.thinkingConfig) {
            throw httpError(400, { error: { message: "Request contains an invalid argument." } });
          }
          return aiReply("gemini", { ok: "flash" });
        },
        "gemini-x-flash-lite": (body) => {
          liteSeen = !body.generationConfig.thinkingConfig;
          return aiReply("gemini", { ok: "lite" });
        },
        "openai/gpt-oss-20b": () => aiReply("groq", { ok: "oss" }),
        "qwen/qwen3.8-27b": () => aiReply("groq", { ok: "qwen" }),
      });

      assert.equal((await askAi("interactive")).ok, "flash");
      assert.deepEqual(poolCalls, ["gemini:gm-flash", "gemini:gm-flash"], "retried once without the setting");
      poolCalls.length = 0;
      await askAi("interactive");
      assert.deepEqual(poolCalls, ["gemini:gm-flash"], "and remembers it");
      assert.equal(poolBodies.at(-1).body.generationConfig.thinkingConfig, undefined);

      aiEnv.GEMINI_MODELS = "gemini-x-flash-lite";
      await askAi("interactive");
      assert.equal(liteSeen, true, "flash-lite models never get the thinking setting");

      aiEnv.GEMINI_MODELS = "";
      aiEnv.GEMINI_API_KEY = "";
      try {
        aiService.resetAiRateState();
        await askAi("interactive");
        assert.equal(poolBodies.at(-1).body.reasoning_effort, "low", "gpt-oss reasons briefly");
        aiEnv.GROQ_MODELS = "qwen/qwen3.8-27b";
        await askAi("interactive");
        assert.equal(poolBodies.at(-1).body.reasoning_effort, "none", "qwen3 does not reason");
      } finally {
        aiEnv.GEMINI_API_KEY = "test-gemini-key";
      }
    },
  );
});

await test("detailed summaries reject figures the article never states", async () => {
  const { unsupportedNumbers } = await import("../src/services/detailedSummaryService.js");
  const source = "Inflation eased to 4.8 per cent. About 1,20,000 jobs were added in 2026 across seven cities.";
  assert.deepEqual(
    unsupportedNumbers("Inflation eased to 4.80 per cent as 120000 jobs came in 2026 in 7 cities.", source),
    [],
    "same figures written differently, and small counts, are fine",
  );
  assert.deepEqual(unsupportedNumbers("About 2,000 homes and 45% of jobs were affected.", source), ["2000", "45"]);
});

await test("ingest stores at most INGEST_MAX_PER_RUN per run, papers taking turns, newest first", async () => {
  const { config: pipelineConfig } = await import("../src/config/env.js");
  const saved = pipelineConfig.INGEST_MAX_PER_RUN;
  const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000);
  const articles = [
    ...Array.from({ length: 20 }, (_, i) => ({ source: "Times of India", url: `t${i}`, publishedAt: at(i) })),
    ...Array.from({ length: 5 }, (_, i) => ({ source: "The Hindu", url: `h${i}`, publishedAt: at(i) })),
    ...Array.from({ length: 5 }, (_, i) => ({ source: "Indian Express", url: `e${i}`, publishedAt: at(i) })),
  ];
  try {
    pipelineConfig.INGEST_MAX_PER_RUN = 20;
    const { selected, deferred } = newsProcessor._capForRun(articles);
    assert.equal(selected.length, 20);
    assert.equal(deferred, 10);
    const count = (source) => selected.filter((a) => a.source === source).length;
    assert.equal(count("The Hindu"), 5);
    assert.equal(count("Indian Express"), 5);
    assert.equal(count("Times of India"), 10);
    const toi = selected.filter((a) => a.source === "Times of India").map((a) => a.url);
    assert.deepEqual(toi.sort(), Array.from({ length: 10 }, (_, i) => `t${i}`).sort(), "the newest ten");

    pipelineConfig.INGEST_MAX_PER_RUN = 0;
    assert.equal(newsProcessor._capForRun(articles).selected.length, 30, "0 means no cap");
  } finally {
    pipelineConfig.INGEST_MAX_PER_RUN = saved;
  }
});

// ---------- short summaries (no AI) ----------
const { buildShortSummary, pickBlurb } = await import("../src/services/content/shortSummary.js");
const wordsIn = (value) => value.split(/\s+/).filter(Boolean).length;
const ARTICLE = [
  "NEW DELHI: The Reserve Bank of India kept the repo rate unchanged at 6.5 per cent on Friday, citing sticky food prices and a fragile global outlook.",
  "Governor Sanjay Malhotra said inflation was expected to average 4.4 per cent this fiscal year, down from an earlier estimate of 4.8 per cent.",
  "The central bank also raised its growth forecast to 7 per cent, helped by strong rural demand and Rs. 1.2 lakh crore of government capital spending.",
  "Banks welcomed the pause. \"We expected the status quo,\" said an analyst at a large brokerage.",
  "Markets reacted calmly, with the Sensex closing 0.4 per cent higher at 82,150 points by the end of the day.",
  "View this post on Instagram A post shared by RBI (@rbi)",
  "Also read: What the rate pause means for home loans",
  "He said the central bank would watch incoming data closely before the next meeting.",
  "The next policy review is scheduled for December, when officials will weigh new inflation figures.",
];
const HEADLINE = "RBI holds repo rate steady";

await test("short summary: lead sentences and key facts when the paper gives no description", async () => {
  const out = buildShortSummary({ headline: HEADLINE, source: "Indian Express", pageText: ARTICLE.join("\n") });
  assert.equal(out.method, "extractive");
  assert.match(out.summary, /^The Reserve Bank of India kept the repo rate/, "dateline is stripped");
  assert.ok(wordsIn(out.summary) <= 50, `summary has ${wordsIn(out.summary)} words`);
  assert.ok(out.keyFacts.length >= 1 && out.keyFacts.length <= 3);
  for (const fact of out.keyFacts) {
    assert.ok(wordsIn(fact) <= 26, `fact too long: ${fact}`);
    assert.ok(!out.summary.includes(fact), "a fact must not repeat the summary");
    assert.ok(!/^(?:He|She|They|It|This|But|And)\b/.test(fact), `fact needs its context: ${fact}`);
  }
  const everything = [out.summary, ...out.keyFacts].join(" ");
  assert.doesNotMatch(everything, /Instagram|Also read|@rbi/i, "junk lines never get through");
  assert.ok(
    out.keyFacts.some((fact) => fact.includes("Rs. 1.2 lakh crore")) || !everything.includes("Rs."),
    "Rs. does not split a sentence",
  );
});

await test("short summary: junk or cut-off publisher descriptions are rejected", async () => {
  const junk = [
    "I agree.",
    "View this post on Instagram A post shared by Mumbai Indians (@mumbaiindians)",
    "&quot;You are a SICK guy! Reuters is terrible, by the way.",
    "TOI Correspondent from Washington: Four days before a midterm election that could leave him politically out of shape, US President Donald Trump decided to",
    "The talks in Geneva ended without a deal and negotiators said they would return after the holidays...",
    "“We will not accept this decision and will challenge it in court, the union leader said on Friday",
    HEADLINE,
    "",
  ];
  for (const text of junk) assert.equal(pickBlurb(text, HEADLINE), null, `should reject: ${text}`);

  const good = pickBlurb(
    "Chandrababu Naidu’s rapid, coordinated response minimizes cyclone damage, restores services across coastal districts",
    "Naidu cyclone response",
  );
  assert.equal(good, "Chandrababu Naidu’s rapid, coordinated response minimizes cyclone damage, restores services across coastal districts.");

  const long = pickBlurb(
    "Heavy rain flooded low-lying areas of the city on Friday evening and disrupted traffic on several major roads for hours. " +
      "Officials said pumps were deployed in the worst affected neighbourhoods and teams worked through the night to clear water. " +
      "The weather office has forecast more showers over the weekend and asked residents to avoid unnecessary travel.",
    "City rain",
  );
  assert.ok(wordsIn(long) <= 45 && /[.]$/.test(long), `trimmed to whole sentences: ${long}`);
});

await test("short summary: page description, then RSS, then the lead, then the headline", async () => {
  const pageText = ARTICLE.join("\n");
  const og = "The central bank held rates and signalled caution on inflation while raising its growth outlook for the year";
  const rss = "The Reserve Bank kept the policy rate unchanged, saying food prices remain a concern for households across the country.";
  const base = { headline: HEADLINE, source: "The Hindu", pageText };

  assert.equal(buildShortSummary({ ...base, pageDescriptions: [og], rssDescription: rss }).method, "publisher-page");
  // TOI's first tag can be junk while a later one is fine.
  const second = buildShortSummary({ ...base, pageDescriptions: ["View this post on Instagram A post shared by RBI", og] });
  assert.equal(second.method, "publisher-page");
  assert.match(second.summary, /^The central bank held rates/);
  assert.equal(buildShortSummary({ ...base, pageDescriptions: ["I agree."], rssDescription: rss }).method, "publisher-rss");
  assert.equal(buildShortSummary(base).method, "extractive");

  const bare = buildShortSummary({ headline: "Budget talks begin", source: "The Hindu" });
  assert.equal(bare.method, "headline");
  assert.ok(bare.summary.length >= 50, "meets the News.summary minimum");
  assert.deepEqual(bare.keyFacts, []);
});

const { extractArticleText, resetRobotsCache } = await import("../src/services/articleTextExtractor.js");
const originalGetForSummaries = axios.get;
const pageHtml = ({ tags = "", paragraphs = [] }) =>
  `<!doctype html><html><head><title>Story</title>${tags}</head><body><header><nav>Menu</nav></header>` +
  `<article><h1>Story</h1>${paragraphs.map((text) => `<p>${text}</p>`).join("")}</article><footer>Footer links</footer></body></html>`;
const CLEAN_PARAGRAPHS = ARTICLE.filter((line) => !/Instagram|Also read/.test(line)).map((line) => line.replace(/^NEW DELHI: /, ""));

await test("page fetch keeps the description tags and paragraphs, and reads robots.txt once per site", async () => {
  resetRobotsCache();
  const requests = [];
  axios.get = async (url) => {
    if (!String(url).includes("pages.example")) return originalGetForSummaries(url);
    requests.push(String(url));
    if (String(url).endsWith("/robots.txt")) return { status: 200, data: "User-agent: *\nAllow: /\n" };
    if (url.includes("/thin")) return { data: pageHtml({ tags: '<meta property="og:description" content="Only a tag">', paragraphs: ["Short."] }) };
    if (url.includes("/down")) throw new Error("connect ECONNREFUSED");
    return {
      data: pageHtml({
        tags:
          '<meta property="og:description" content="First tag description for the story about rates and prices">' +
          '<meta name="twitter:description" content="Second tag description for the story about rates and prices">' +
          '<meta name="description" content="Third tag description for the story about rates and prices">',
        paragraphs: CLEAN_PARAGRAPHS,
      }),
    };
  };
  try {
    const page = await extractArticleText("https://pages.example/a", { minChars: 300, paragraphs: true });
    assert.equal(page.available, true);
    assert.deepEqual(page.descriptions.map((d) => d.split(" ")[0]), ["First", "Second", "Third"]);
    assert.ok(page.paragraphs.length >= 5, `paragraphs: ${page.paragraphs.length}`);

    const thin = await extractArticleText("https://pages.example/thin", { minChars: 300 });
    assert.equal(thin.available, false);
    assert.deepEqual(thin.descriptions, ["Only a tag"], "tags survive a thin page");
    assert.ok(!thin.failed);

    const down = await extractArticleText("https://pages.example/down", { minChars: 300 });
    assert.equal(down.available, false);
    assert.equal(down.failed, true);

    assert.equal(requests.filter((url) => url.endsWith("/robots.txt")).length, 1, "robots.txt fetched once");
  } finally {
    axios.get = originalGetForSummaries;
  }
});

await test("ingest builds summaries from pages with no AI calls, spaces requests and skips a failing site", async () => {
  const { config: pipelineConfig } = await import("../src/config/env.js");
  const saved = { fetch: pipelineConfig.SUMMARY_PAGE_FETCH, delay: pipelineConfig.PAGE_FETCH_DELAY_MS };
  pipelineConfig.SUMMARY_PAGE_FETCH = true;
  pipelineConfig.PAGE_FETCH_DELAY_MS = 0;
  resetRobotsCache();
  stubAi({});
  newsProcessor.logger.stats.pageFetch = {};
  newsProcessor.logger.stats.summaryMethods = {};
  const downRequests = [];
  axios.get = async (url) => {
    const text = String(url);
    if (!text.includes("tests.example") && !text.includes("down.example")) return originalGetForSummaries(url);
    if (text.endsWith("/robots.txt")) return { status: 404, data: "" };
    if (text.includes("down.example")) {
      downRequests.push(text);
      throw new Error("connect ETIMEDOUT");
    }
    if (text.includes("with-tag")) {
      return {
        data: pageHtml({
          tags: '<meta property="og:description" content="Reserve Bank holds rates steady as inflation cools and the growth forecast is raised to seven per cent">',
          paragraphs: CLEAN_PARAGRAPHS,
        }),
      };
    }
    return { data: pageHtml({ paragraphs: CLEAN_PARAGRAPHS }) };
  };
  const make = (url, extra = {}) => ({
    source: "Test Paper",
    headline: HEADLINE,
    summary: `${HEADLINE}. Read the original report at Test Paper.`,
    rssDescription: "",
    url,
    ...extra,
  });
  try {
    const articles = [
      make("https://tests.example/plain"),
      make("https://tests.example/with-tag"),
      ...Array.from({ length: 8 }, (_, i) => make(`https://down.example/story-${i}`)),
    ];
    const done = await newsProcessor._summarizeArticles(articles, async () => {});

    assert.equal(done[0].summaryMethod, "extractive");
    assert.ok(done[0].keyFacts.length >= 1);
    assert.ok(done[0].sourceWordCount > 50);
    assert.equal(done[0].promptVersion, null);
    assert.equal(done[1].summaryMethod, "publisher-page");
    assert.match(done[1].summary, /^Reserve Bank holds rates steady/);
    assert.equal(aiCalls.length, 0, "no AI call is made for short summaries");

    // The site that keeps failing is tried 5 times, then skipped.
    assert.equal(downRequests.length, 5);
    for (const result of done.slice(2)) {
      assert.equal(result.summaryMethod, "headline");
      assert.ok(result.summary.length >= 50);
    }
    const stats = newsProcessor.logger.stats;
    assert.equal(stats.pageFetch["Test Paper"].ok, 2);
    assert.equal(stats.pageFetch["Test Paper"].failed, 5);
    assert.equal(stats.pageFetch["Test Paper"].skipped, 3);
    assert.equal(stats.summaryMethods.headline, 8);

    // The kill switch: no page requests at all, RSS description or headline only.
    pipelineConfig.SUMMARY_PAGE_FETCH = false;
    let pageRequests = 0;
    axios.get = async (url) => {
      if (String(url).includes("tests.example")) pageRequests += 1;
      return originalGetForSummaries(url);
    };
    const offline = await newsProcessor._summarizeArticles(
      [
        make("https://tests.example/off-1", {
          rssDescription: "The Reserve Bank kept the policy rate unchanged, saying food prices remain a concern for households.",
        }),
        make("https://tests.example/off-2"),
      ],
      async () => {},
    );
    assert.equal(pageRequests, 0);
    assert.equal(offline[0].summaryMethod, "publisher-rss");
    assert.equal(offline[1].summaryMethod, "headline");
  } finally {
    axios.get = originalGetForSummaries;
    pipelineConfig.SUMMARY_PAGE_FETCH = saved.fetch;
    pipelineConfig.PAGE_FETCH_DELAY_MS = saved.delay;
    unstubAi();
  }
});

await test("page-based summaries pass News validation and are stored with their method", async () => {
  const { config: pipelineConfig } = await import("../src/config/env.js");
  const saved = { fetch: pipelineConfig.SUMMARY_PAGE_FETCH, delay: pipelineConfig.PAGE_FETCH_DELAY_MS };
  pipelineConfig.SUMMARY_PAGE_FETCH = true;
  pipelineConfig.PAGE_FETCH_DELAY_MS = 0;
  resetRobotsCache();
  stubAi({});
  const url = "https://tests.example/store-1";
  axios.get = async (target) => {
    if (!String(target).includes("tests.example")) return originalGetForSummaries(target);
    if (String(target).endsWith("/robots.txt")) return { status: 404, data: "" };
    return { data: pageHtml({ paragraphs: CLEAN_PARAGRAPHS }) };
  };
  try {
    const [item] = await newsProcessor._summarizeArticles(
      [
        {
          source: "The Hindu",
          headline: HEADLINE,
          summary: `${HEADLINE}. Read the original report at The Hindu.`,
          rssDescription: "",
          url,
          feedCategory: "Business",
          publishedAt: new Date(),
        },
      ],
      async () => {},
    );
    const before = newsProcessor.logger.stats.stored;
    const failedBefore = newsProcessor.logger.stats.failed;
    await newsProcessor._storeArticles([item]);
    assert.equal(newsProcessor.logger.stats.failed, failedBefore, "News validation rejected the article");
    assert.equal(newsProcessor.logger.stats.stored, before + 1);

    const stored = await News.findOne({ url }).lean();
    assert.equal(stored.summaryMethod, "extractive");
    assert.equal(stored.modelUsed, "rule-based");
    assert.ok(stored.summary.length >= 50 && stored.keyFacts.length >= 1);
    assert.deepEqual(stored.bulletPoints, stored.keyFacts);
  } finally {
    await News.deleteMany({ url });
    axios.get = originalGetForSummaries;
    pipelineConfig.SUMMARY_PAGE_FETCH = saved.fetch;
    pipelineConfig.PAGE_FETCH_DELAY_MS = saved.delay;
    unstubAi();
  }
});

// ---------- config / env ----------
await test("dotenv/env config loads real values", async () => {
  const { config } = await import("../src/config/env.js");
  assert.equal(config.JWT_SECRET, process.env.JWT_SECRET);
  assert.equal(config.CORS_ORIGIN, "http://localhost:3000");
  // The providers that actually back AI_PROVIDER. OPENAI_MODEL used to be
  // asserted here, but no code path calls OpenAI any more.
  assert.equal(config.AI_PROVIDER, "gemini");
  assert.equal(config.GEMINI_MODELS, "gemini-3.8-flash");
  assert.equal(config.GEMINI_MODEL, undefined, "replaced by the GEMINI_MODELS pool");
  assert.equal(config.OPENAI_MODEL, undefined);
  assert.equal(config.NEWS_API_KEY, undefined);
});

// ---------- auth ----------
let token;
const email = `reader-${Date.now()}@example.com`;

await test("register returns a usable token", async () => {
  const res = await api("/auth/register", {
    method: "POST",
    body: {
      name: "Test Reader",
      email,
      password: "supersecret1",
      confirmPassword: "supersecret1",
    },
  });
  assert.equal(res.status, 201);
  assert.ok(res.data.token, "register should return a token");
  token = res.data.token;
});

await test("register rejects mismatched confirmation", async () => {
  const res = await api("/auth/register", {
    method: "POST",
    body: {
      name: "X",
      email: `x${Date.now()}@example.com`,
      password: "supersecret1",
      confirmPassword: "different1",
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.data.message, /do not match/i);
});

await test("register enforces 8-char minimum password", async () => {
  const res = await api("/auth/register", {
    method: "POST",
    body: {
      name: "X",
      email: `y${Date.now()}@example.com`,
      password: "short",
      confirmPassword: "short",
    },
  });
  assert.equal(res.status, 400);
});

await test("login works and /auth/me resolves", async () => {
  const res = await api("/auth/login", {
    method: "POST",
    body: { email, password: "supersecret1" },
  });
  assert.equal(res.status, 200);
  token = res.data.token;

  const me = await api("/auth/me", { token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, email);
});

await test("login gives no user-enumeration signal", async () => {
  const res = await api("/auth/login", {
    method: "POST",
    body: { email: "nobody@example.com", password: "wrongpassword" },
  });
  assert.equal(res.status, 401);
  assert.match(res.data.message, /invalid email or password/i);
});

// ---------- Google sign-in ----------
// Google is stubbed: tokeninfo reports `tokenAudience`, and userinfo returns
// whatever profile the test sets. A separate client IP keeps these requests
// out of the shared auth rate-limit bucket the brute-force test relies on.
const { OAuth2Client } = await import("google-auth-library");
const { config: appConfig } = await import("../src/config/env.js");
const originalTokenInfo = OAuth2Client.prototype.getTokenInfo;
const originalAxiosGet = axios.get;
let googlePayload = null;
let tokenAudience = null;
OAuth2Client.prototype.getTokenInfo = async function () {
  if (!googlePayload) throw new Error("invalid_token");
  return { aud: tokenAudience, scopes: ["openid", "email", "profile"] };
};
axios.get = async (url, options) => {
  if (!String(url).includes("googleapis.com")) return originalAxiosGet(url, options);
  return { data: googlePayload };
};
let googleIp = 0;
const googleAuth = (accessToken = "google-access-token") =>
  api("/auth/google", {
    method: "POST",
    body: { accessToken },
    headers: { "X-Forwarded-For": `10.0.0.${++googleIp}` },
  });
const googleUser = {
  sub: "google-sub-123",
  email: "Google.Reader@Example.design",
  email_verified: true,
  name: "Google Reader",
  picture: "https://lh3.googleusercontent.com/a/avatar",
};

await test("Google sign-in answers 503 when GOOGLE_CLIENT_ID is unset", async () => {
  appConfig.GOOGLE_CLIENT_ID = "";
  const res = await googleAuth();
  assert.equal(res.status, 503);
  appConfig.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  tokenAudience = appConfig.GOOGLE_CLIENT_ID;
});

await test("Google sign-in rejects an invalid or missing credential", async () => {
  googlePayload = null;
  assert.equal((await googleAuth()).status, 401);
  assert.equal((await googleAuth("")).status, 400);
});

await test("Google sign-in rejects a token issued to another app", async () => {
  googlePayload = googleUser;
  tokenAudience = "someone-elses-app.apps.googleusercontent.com";
  assert.equal((await googleAuth()).status, 401);
  tokenAudience = appConfig.GOOGLE_CLIENT_ID;
});

await test("Google sign-in rejects an unverified email", async () => {
  googlePayload = { ...googleUser, email_verified: false };
  assert.equal((await googleAuth()).status, 401);
});

let googleUserId;
await test("Google sign-in creates an account and returns a working token", async () => {
  googlePayload = googleUser;
  const res = await googleAuth();
  assert.equal(res.status, 201);
  assert.equal(res.data.user.email, "google.reader@example.design");
  assert.equal(res.data.user.avatar, googleUser.picture);
  googleUserId = res.data.user.id;

  const me = await api("/auth/me", { token: res.data.token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.name, "Google Reader");
});

await test("Google sign-in again reuses the same account", async () => {
  googlePayload = { ...googleUser, email: "renamed@example.com" };
  const res = await googleAuth();
  assert.equal(res.status, 200);
  assert.equal(res.data.user.id, googleUserId);
});

await test("Google sign-in links to an existing password account by email", async () => {
  googlePayload = { ...googleUser, sub: "google-sub-456", email };
  const res = await googleAuth();
  assert.equal(res.status, 200);
  assert.equal(res.data.user.email, email);

  const password = await api("/auth/login", {
    method: "POST",
    body: { email, password: "supersecret1" },
    headers: { "X-Forwarded-For": "10.0.1.1" },
  });
  assert.equal(password.status, 200, "password login must still work after linking");
  assert.equal(password.data.user.id, res.data.user.id);
});

await test("password login to a Google-only account is a plain 401", async () => {
  const res = await api("/auth/login", {
    method: "POST",
    body: { email: "google.reader@example.design", password: "whatever123" },
    headers: { "X-Forwarded-For": "10.0.1.2" },
  });
  assert.equal(res.status, 401);
  assert.match(res.data.message, /invalid email or password/i);
});

OAuth2Client.prototype.getTokenInfo = originalTokenInfo;
axios.get = originalAxiosGet;

await test("garbage token is rejected", async () => {
  const res = await api("/auth/me", { token: "not-a-real-token" });
  assert.equal(res.status, 401);
});

// ---------- news reads ----------
await test("GET /news returns the article with real field names", async () => {
  const res = await api("/news");
  assert.equal(res.status, 200);
  assert.equal(res.data.data.length, 1);
  const a = res.data.data[0];
  assert.equal(a.headline, article.headline);
  assert.ok(a.summary, "summary must be present");
  assert.ok(Array.isArray(a.bulletPoints));
  assert.deepEqual(a.tags, ["Polity", "Economy"]);
  assert.equal(typeof a.date, "string");
  assert.equal(a.source, "The Hindu");
});

await test("GET /news paginates with limit/skip", async () => {
  const res = await api("/news?limit=1&skip=0");
  assert.equal(res.status, 200);
  assert.equal(res.data.pagination.limit, 1);
  assert.equal(res.data.pagination.total, 1);
});

await test("GET /news?tags= filters by tag", async () => {
  const res = await api("/news?tags=Economy");
  assert.equal(res.data.data.length, 1);
  const none = await api("/news?tags=Science");
  assert.equal(none.data.data.length, 0);
});

await test("GET /news/:id returns the article without quiz data", async () => {
  const res = await api(`/news/${articleId}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.data.quiz, undefined);
  assert.ok(res.data.data.headline);
});

await test("GET /news/:id rejects a malformed id", async () => {
  const res = await api("/news/not-an-id");
  assert.equal(res.status, 400);
});

// ---------- route shadowing (the /:id vs /search + /fetch-daily bug) ----------
await test("GET /news/search is reachable (not shadowed by /:id)", async () => {
  const res = await api("/news/search?q=education");
  assert.equal(res.status, 200, `got ${res.status} - route is shadowed`);
  assert.equal(res.data.data.length, 1);
});

await test("GET /news/search returns pagination", async () => {
  const res = await api("/news/search?q=education");
  assert.ok(res.data.pagination, "search must include pagination");
  assert.equal(typeof res.data.pagination.total, "number");
});

await test("GET /news/stats/overview is reachable", async () => {
  const res = await api("/news/stats/overview");
  assert.equal(res.status, 200);
  assert.equal(res.data.data.totalArticles, 1);
  assert.equal(res.data.data.bySource["The Hindu"], 1);
  assert.equal(res.data.data.byTag.Polity, 1);
  assert.equal(typeof res.data.data.detailed.byStatus, "object");
  assert.equal(typeof res.data.data.detailed.byModel, "object");
});

await test("GET /news/fetch-daily is removed", async () => {
  const res = await api("/news/fetch-daily");
  assert.equal(res.status, 404);
});

await test("POST /admin/ingest rejects an invalid cron secret", async () => {
  const res = await api("/admin/ingest", {
    method: "POST",
    headers: { "x-cron-secret": "wrong-secret" },
    body: {},
  });
  assert.equal(res.status, 401);
});

await test("POST /news/:id/detailed requires auth", async () => {
  const res = await api(`/news/${articleId}/detailed`, { method: "POST" });
  assert.equal(res.status, 401);
});

await test("a rate-limited detailed request answers 429 and keeps the article retryable", async () => {
  stubAi({ gemini: geminiDailyQuotaUsed, groq: groqRateLimited(450) });
  const originalAxiosGet = axios.get;
  let pageFetched = false;
  try {
    await assert.rejects(askAi("interactive")); // both providers now cooling down
    axios.get = async () => {
      pageFetched = true;
      throw new Error("the article page should not be fetched");
    };

    const res = await api(`/news/${articleId}/detailed`, { method: "POST", token, body: {} });
    assert.equal(res.status, 429);
    assert.ok(res.data.retryAfterMs > 440_000, `retryAfterMs was ${res.data.retryAfterMs}`);
    assert.equal(res.data.data.detailedStatus, "NONE");
    assert.equal(pageFetched, false, "no page fetch when no AI capacity is coming");
    assert.equal((await News.findById(articleId).lean()).detailedStatus, "NONE");

    // The background batch must hand articles back too, not mark them FAILED.
    const { generateTopDetailedSummaries } = await import(
      "../src/services/detailedSummaryService.js"
    );
    const batch = await generateTopDetailedSummaries();
    assert.equal(batch.completed, 0);
    assert.equal(await News.countDocuments({ detailedStatus: { $in: ["FAILED", "PENDING"] } }), 0);
  } finally {
    axios.get = originalAxiosGet;
    unstubAi();
  }
});

await test("POST /admin/ingest returns 202 with the cron secret", async () => {
  const res = await api("/admin/ingest", {
    method: "POST",
    headers: { "x-cron-secret": "test-cron-secret" },
    body: { dryRun: true },
  });
  assert.equal(res.status, 202);
});

await test("GET /news/tag/:tag works", async () => {
  const res = await api("/news/tag/Polity");
  assert.equal(res.status, 200);
  assert.equal(res.data.data.length, 1);
});

// ---------- quiz routes removed ----------
await test("GET /quiz/:id is gone (quiz feature removed)", async () => {
  const res = await api(`/quiz/${articleId}`);
  assert.equal(res.status, 404);
});

await test("POST /quiz/submit is gone (quiz feature removed)", async () => {
  const res = await api("/quiz/submit", {
    method: "POST",
    token,
    body: { articleId, answers: ["A"] },
  });
  assert.equal(res.status, 404);
});

// ---------- notes feature removed ----------
await test("GET /notes is gone (notes feature removed)", async () => {
  const res = await api("/notes", { token });
  assert.equal(res.status, 404);
});

await test("POST /notes is gone (notes feature removed)", async () => {
  const res = await api("/notes", {
    method: "POST",
    token,
    body: { articleId, content: "Notes no longer exist in this build." },
  });
  assert.equal(res.status, 404);
});

await test("GET /notes/article/:id is gone (notes feature removed)", async () => {
  const res = await api(`/notes/article/${articleId}`);
  assert.equal(res.status, 404);
});

// ---------- ai routes ----------
await test("POST /news requires auth (was public)", async () => {
  const res = await api("/news", {
    method: "POST",
    body: {
      source: "The Hindu",
      headline: "Injected article headline for test",
      summary: "A summary that comfortably exceeds the fifty character minimum.",
      bulletPoints: ["one", "two", "three"],
      tags: ["Polity"],
    },
  });
  assert.equal(res.status, 401);
});

await test("POST /news rejects an invalid source enum", async () => {
  const res = await api("/news", {
    method: "POST",
    token,
    body: {
      source: "BBC News",
      headline: "Some headline that is long enough here",
      summary: "A summary that comfortably exceeds the fifty character minimum.",
      bulletPoints: ["one", "two", "three"],
      tags: ["Polity"],
    },
  });
  assert.equal(res.status, 400);
});

// ---------- rate limiting ----------
await test("auth endpoints are rate limited (brute-force mitigation)", async () => {
  let sawLimit = false;
  for (let i = 0; i < 20; i++) {
    const res = await api("/auth/login", {
      method: "POST",
      body: { email: "nobody@example.com", password: "wrongpassword" },
    });
    if (res.status === 429) {
      sawLimit = true;
      break;
    }
  }
  assert.ok(sawLimit, "expected a 429 after repeated failed logins");
});

// ---------- misc ----------
await test("unknown route returns 404 JSON", async () => {
  const res = await api("/does-not-exist");
  assert.equal(res.status, 404);
  assert.equal(res.data.success, false);
});

await test("plain news article is retrievable", async () => {
  const plain = await News.create({
    source: "Indian Express",
    headline: "Defence ministry announces procurement policy update",
    summary:
      "The defence ministry outlined a revised procurement policy intended to speed up indigenous equipment acquisition across several services.",
    bulletPoints: ["Revised procurement timelines", "Indigenous priority", "Expedited trials"],
    tags: ["Defense"],
    date: new Date(),
  });
  const res = await api(`/news/${plain._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.data.quiz, undefined);
  assert.ok(res.data.data.headline);
});

await test("UTC day boundary: article from yesterday is not 'today'", async () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await News.create({
    source: "Times of India",
    headline: "Yesterday's cabinet meeting covered fiscal policy",
    summary:
      "A previous day article describing the cabinet meeting in enough detail to satisfy validation.",
    bulletPoints: ["a", "b", "c"],
    tags: ["Economy"],
    date: yesterday,
    publishedAt: yesterday,
  });
  const res = await api("/news");
  assert.equal(res.data.pagination.total, 2, "today should only include today");
});

// ---------- categories & combined filtering ----------
// Seeded after the UTC test above, which asserts an exact `total`.
const {
  resolveCategory,
  categoryFromFeed,
  categoryFromKeywords,
  NEWS_CATEGORIES,
} = await import("../src/utils/category.js");

const politicsArticle = await News.create({
  source: "The Hindu",
  category: "Politics & Governance",
  headline: "Parliament approves quantumledger digital payments amendment",
  summary:
    "The parliament approved the quantumledger amendment, which rewrites the settlement rules for digital payments across the country.",
  bulletPoints: ["Amendment text approved", "Settlement rules rewritten", "Rollout in two quarters"],
  tags: ["Polity"],
  date: new Date(),
});

const techArticle = await News.create({
  source: "Indian Express",
  category: "Science & Technology",
  headline: "New semiconductor fabrication plant opens in Pune",
  summary:
    "A semiconductor fabrication plant began operations in Pune, adding capacity for advanced chip packaging in the country.",
  bulletPoints: ["Plant begins output", "Packaging capacity added", "Skilled hiring underway"],
  tags: ["Science"],
  date: new Date(),
});

await News.create({
  source: "Times of India",
  category: "Economy & Business",
  headline: "Sensex gains as quarterly profits rise across listed firms",
  summary:
    "The Sensex closed higher as quarterly profits rose across listed firms, with the banking index leading the advance.",
  bulletPoints: ["Index closed higher", "Banking index led", "Broader market firm"],
  tags: ["Economy"],
  date: new Date(),
});

await test("category defaults to Misc when not supplied", async () => {
  const plain = await News.create({
    source: "The Hindu",
    headline: "Weather department issues advisory for coastal districts",
    summary:
      "The weather department issued an advisory about heavy rainfall expected along the coastline during the coming week.",
    bulletPoints: ["Advisory issued", "Heavy rainfall likely", "Coastal districts listed"],
    tags: ["Science"],
    date: new Date(),
  });
  assert.equal(plain.category, "Misc");
});

await test("category derivation prefers the feed category over keywords", async () => {
  // "parliament" is a Politics keyword, but the feed says "business", and the
  // feed label must win.
  const result = resolveCategory({
    feedCategory: "business",
    text: "Parliament discussed the budget allocation in detail",
    aiCategory: "Science & Technology",
  });
  assert.equal(result.category, "Economy & Business");
  assert.equal(result.derivedBy, "feed");
});

await test("category derivation falls back to keywords when the feed is unmapped", async () => {
  const result = resolveCategory({
    feedCategory: "general",
    text: "The parliament debated the new electoral reform bill",
    aiCategory: "Economy & Business",
  });
  assert.equal(result.category, "Politics & Governance");
  assert.equal(result.derivedBy, "keywords");
});

await test("category derivation uses the AI only as a last resort", async () => {
  // No feed label, and the keyword rules deliberately do not fire on this
  // text (\b-anchored, so "said" cannot match "ai" and "police" cannot match
  // any Politics term).
  const text = "Traffic was slow on the highway over the weekend, officials said.";
  assert.equal(categoryFromKeywords(text), null, "fixture must not match any keyword rule");

  const result = resolveCategory({
    feedCategory: null,
    text,
    aiCategory: "Entertainment",
  });
  assert.equal(result.category, "Entertainment");
  assert.equal(result.derivedBy, "ai");
});

await test("category derivation lands on Misc with nothing to go on", async () => {
  const result = resolveCategory({ feedCategory: "general", text: "zorb blimp" });
  assert.equal(result.category, "Misc");
  assert.equal(result.derivedBy, "default");
});

await test("keyword matching is word-boundary safe", async () => {
  // "ai" must not match "said", "war" must not match "award".
  assert.equal(categoryFromKeywords("He said the plan was unclear"), null);
  assert.equal(categoryFromKeywords("They received an award for the war memoir"), null);
  assert.equal(categoryFromFeed("technology"), "Science & Technology");
});

await test("GET /news?category= filters by category", async () => {
  const res = await api("/news?category=Science%20%26%20Technology");
  assert.equal(res.status, 200);
  assert.ok(res.data.data.length >= 1, "should find the Tech article");
  assert.ok(
    res.data.data.every((a) => a.category === "Science & Technology"),
    "every returned article must be Tech",
  );
});

await test("GET /news combines search + category + source as AND", async () => {
  const hit = await api("/news?search=quantumledger&category=Politics%20%26%20Governance&source=The%20Hindu");
  assert.equal(hit.status, 200);
  assert.equal(hit.data.data.length, 1, "all three filters should match one article");
  assert.equal(hit.data.data[0]._id, politicsArticle._id.toString());

  // The same search with a conflicting category must return nothing, which
  // proves the filters intersect rather than each overriding the last.
  const miss = await api("/news?search=quantumledger&category=Science%20%26%20Technology");
  assert.equal(miss.status, 200);
  assert.equal(miss.data.data.length, 0, "search + conflicting category should be empty");

  // And search combined with a conflicting source must also be empty.
  const missSource = await api(
    "/news?search=quantumledger&category=Politics%20%26%20Governance&source=Indian%20Express",
  );
  assert.equal(missSource.data.data.length, 0, "conflicting source should be empty");
});

await test("GET /news rejects an unknown category instead of ignoring it", async () => {
  const res = await api("/news?category=Nonsense");
  assert.equal(res.status, 400);
  assert.match(res.data.message, /Invalid category/);
});

await test("GET /news returns category facets that survive the category filter", async () => {
  const res = await api("/news?category=Politics%20%26%20Governance");
  assert.equal(res.status, 200);

  // Every category is present, including the zero-count ones, so the chip
  // bar does not reflow as filters change.
  for (const category of NEWS_CATEGORIES) {
    assert.ok(
      Object.hasOwn(res.data.facets.byCategory, category),
      `facets.byCategory should include ${category}`,
    );
  }

  // Counts come from the filter MINUS the category constraint, so selecting
  // Politics must not zero out the other cards.
  assert.ok(
    res.data.facets.byCategory["Science & Technology"] >= 1,
    "Science & Technology facet should still be counted while Politics is selected",
  );
  assert.ok(res.data.facets.bySource["The Hindu"] >= 1, "source facets should be present");
  assert.ok(res.data.facets.byTag.Polity >= 1, "tag facets should be present");
  assert.ok(techArticle._id);
});

await test("POST /news accepts a valid category and rejects an invalid one", async () => {
  const payload = {
    source: "The Hindu",
    headline: "Regulator issues guidelines for digital lending platforms",
    summary:
      "The regulator published fresh guidelines for digital lending platforms, tightening disclosure norms for interimised loans.",
    bulletPoints: ["Guidelines published", "Disclosure norms tightened", "Compliance by next quarter"],
    tags: ["Economy"],
    category: "Economy & Business",
  };

  const ok = await api("/news", { method: "POST", token, body: payload });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.data.category, "Economy & Business");

  const bad = await api("/news", {
    method: "POST",
    token,
    body: { ...payload, category: "Nonsense" },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.data.message, /Invalid category/);
});

// ---------- bookmarks ----------
const Bookmark = (await import("../src/models/Bookmark.js")).default;
const saved = await News.create({
  source: "The Hindu",
  headline: "Bookmarked story survives the nightly reset",
  summary: "A story saved by a reader must stay readable after all articles are deleted at midnight.",
  tags: ["Polity"],
  url: "https://example.com/bookmarked-story",
  date: new Date(),
  isPublished: true,
});

await test("saving a bookmark sets a 30-day expiry and stores a snapshot", async () => {
  const res = await api(`/bookmarks/${saved._id}`, { method: "POST", token });
  assert.equal(res.status, 200);
  const bookmark = await Bookmark.findOne({ article: saved._id }).lean();
  assert.equal(bookmark.snapshot.headline, saved.headline);
  const daysLeft = (bookmark.expiresAt - Date.now()) / 86400000;
  assert.ok(daysLeft > 29.99 && daysLeft <= 30, `expiry was ${daysLeft} days away`);
});

await test("re-saving a bookmark does not extend its expiry", async () => {
  const before = (await Bookmark.findOne({ article: saved._id }).lean()).expiresAt;
  await api(`/bookmarks/${saved._id}`, { method: "POST", token });
  const after = (await Bookmark.findOne({ article: saved._id }).lean()).expiresAt;
  assert.equal(after.getTime(), before.getTime());
});

await test("deleting articles refreshes the snapshot, and the bookmark stays readable", async () => {
  await News.updateOne(
    { _id: saved._id },
    { detailedStatus: "DONE", detailedSummary: "Generated after the reader saved it." },
  );
  await News.deleteMany({ _id: saved._id });

  const list = await api("/bookmarks", { token });
  assert.equal(list.status, 200);
  assert.equal(list.data.pagination.total, 1);
  assert.equal(list.data.data.length, 1);
  assert.equal(list.data.data[0].archived, true);
  assert.equal(list.data.data[0].detailedSummary, "Generated after the reader saved it.");

  const one = await api(`/bookmarks/${saved._id}`, { token });
  assert.equal(one.status, 200);
  assert.equal(one.data.data.headline, saved.headline);
  assert.equal(one.data.data.detailedStatus, "DONE");

  const status = await api(`/bookmarks/${saved._id}/status`, { token });
  assert.equal(status.data.data.bookmarked, true);
});

await test("an expired bookmark is hidden before the TTL monitor removes it", async () => {
  await Bookmark.updateOne({ article: saved._id }, { expiresAt: new Date(Date.now() - 1000) });
  const list = await api("/bookmarks", { token });
  assert.equal(list.data.pagination.total, 0);
  assert.equal(list.data.data.length, 0);
  const one = await api(`/bookmarks/${saved._id}`, { token });
  assert.equal(one.status, 404);
  const status = await api(`/bookmarks/${saved._id}/status`, { token });
  assert.equal(status.data.data.bookmarked, false);
});

await test("bookmark expiry is backed by a TTL index", async () => {
  const indexes = await Bookmark.collection.indexes();
  const ttl = indexes.find((index) => index.key.expiresAt === 1);
  assert.equal(ttl?.expireAfterSeconds, 0);
});


// ---------- For You picks ----------
// Own client IPs: the brute-force test above has used up the shared auth
// rate-limit bucket for the default one.
let readerIp = 0;
const asReader = (path, options = {}) =>
  api(path, { ...options, headers: { "X-Forwarded-For": `10.0.2.${++readerIp}`, ...options.headers } });
const registerReader = async (label) => {
  const res = await asReader("/auth/register", {
    method: "POST",
    body: {
      name: `${label} Reader`,
      email: `${label}-${Date.now()}@example.com`,
      password: "supersecret1",
      confirmPassword: "supersecret1",
    },
  });
  assert.equal(res.status, 201, `register ${label}: ${res.data?.message}`);
  return { token: res.data.token, email: res.data.user.email };
};
const picker = await registerReader("picker");

const seedToday = (source, category, slug) =>
  News.create({
    source,
    category,
    headline: `${category} story from ${source} for the For You feed`,
    summary: `A ${category} story from ${source}, seeded so the personalised feed has something to choose between.`,
    tags: ["Polity"],
    url: `https://example.com/for-you-${slug}`,
    date: new Date(),
    publishedDayKey: istDayKey(),
    isPublished: true,
  });
const [hinduSports, hinduScience, toiSports, hinduHealth] = await Promise.all([
  seedToday("The Hindu", "Sports", "hindu-sports"),
  seedToday("The Hindu", "Science & Technology", "hindu-science"),
  seedToday("Times of India", "Sports", "toi-sports"),
  seedToday("The Hindu", "Health", "hindu-health"),
]);

await test("new accounts start without picks, and For You asks for them", async () => {
  const me = await api("/auth/me", { token: picker.token });
  assert.deepEqual(me.data.user.preferences, { sources: [], topics: [], onboardedAt: null });
  assert.equal(me.data.user.hasPassword, true);
  assert.equal(me.data.user.hasGoogle, false);

  const feed = await api("/news/for-you", { token: picker.token });
  assert.equal(feed.status, 409);
});

await test("picks are validated", async () => {
  const save = (body) => api("/me/preferences", { method: "PUT", token: picker.token, body });
  assert.equal((await save({ sources: ["The Daily Planet"], topics: ["sports"] })).status, 400);
  assert.equal((await save({ sources: ["The Hindu"], topics: [] })).status, 400);
  assert.equal((await save({ sources: "The Hindu", topics: ["sports"] })).status, 400);
  assert.equal((await save({ sources: ["The Hindu"], topics: ["astrology"] })).status, 400);
});

await test("saved picks show up on the account", async () => {
  const res = await api("/me/preferences", {
    method: "PUT",
    token: picker.token,
    body: { sources: ["The Hindu", "The Hindu"], topics: ["sports", "science-technology"] },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.preferences.sources, ["The Hindu"], "duplicates dropped");
  assert.ok(res.data.preferences.onboardedAt);

  const me = await api("/auth/me", { token: picker.token });
  assert.deepEqual(me.data.user.preferences.topics, ["sports", "science-technology"]);
});

await test("For You holds only the picked sources AND topics", async () => {
  const res = await api("/news/for-you?limit=100", { token: picker.token });
  assert.equal(res.status, 200);
  const ids = res.data.data.map((article) => article._id);
  assert.ok(ids.includes(String(hinduSports._id)));
  assert.ok(ids.includes(String(hinduScience._id)));
  assert.ok(!ids.includes(String(toiSports._id)), "unpicked source");
  assert.ok(!ids.includes(String(hinduHealth._id)), "unpicked topic");
  for (const article of res.data.data) {
    assert.equal(article.source, "The Hindu");
    assert.ok(["Sports", "Science & Technology"].includes(article.category));
  }
  assert.equal(res.data.facets.byCategory.Health, 0, "counts stay inside the picks");
  assert.equal(res.data.facets.bySource["Times of India"], 0);
});

await test("card filters narrow For You but never widen it", async () => {
  const sports = await api("/news/for-you?topic=Sports&limit=100", { token: picker.token });
  assert.ok(sports.data.data.length > 0);
  assert.ok(sports.data.data.every((article) => article.category === "Sports"));

  const health = await api("/news/for-you?topic=Health", { token: picker.token });
  assert.equal(health.status, 200);
  assert.equal(health.data.pagination.total, 0);

  const toi = await api("/news/for-you?source=Times%20of%20India", { token: picker.token });
  assert.equal(toi.data.pagination.total, 0);
});

await test("skipping the picker is remembered without inventing picks", async () => {
  const skipper = await registerReader("skipper");
  const res = await api("/me/onboarding/skip", { method: "POST", token: skipper.token });
  assert.equal(res.status, 200);
  assert.ok(res.data.preferences.onboardedAt);
  assert.deepEqual(res.data.preferences.topics, []);
  assert.equal((await api("/news/for-you", { token: skipper.token })).status, 409);
});

// ---------- account deletion ----------
const User = (await import("../src/models/User.js")).default;
const { generateToken } = await import("../src/services/jwtService.js");

await test("deleting an account needs the confirm flag", async () => {
  const reader = await registerReader("careful");
  const res = await api("/me", { method: "DELETE", token: reader.token, body: {} });
  assert.equal(res.status, 400);
  assert.equal((await api("/auth/me", { token: reader.token })).status, 200, "still active");
});

await test("deleting an account removes it and its saved articles for good", async () => {
  const reader = await registerReader("leaver");
  const me = await api("/auth/me", { token: reader.token });
  await api(`/bookmarks/${hinduSports._id}`, { method: "POST", token: reader.token });
  const Bookmark = (await import("../src/models/Bookmark.js")).default;
  assert.equal(await Bookmark.countDocuments({ user: me.data.user.id }), 1);

  const res = await api("/me", { method: "DELETE", token: reader.token, body: { confirm: "DELETE" } });
  assert.equal(res.status, 200);
  assert.equal(await User.countDocuments({ email: reader.email }), 0);
  assert.equal(await Bookmark.countDocuments({ user: me.data.user.id }), 0);
  assert.equal((await api("/auth/me", { token: reader.token })).status, 404, "old token is useless");

  const login = await asReader("/auth/login", {
    method: "POST",
    body: { email: reader.email, password: "supersecret1" },
  });
  assert.equal(login.status, 401, "cannot sign back in");
  const again = await asReader("/auth/register", {
    method: "POST",
    body: { name: "Leaver Again", email: reader.email, password: "supersecret1", confirmPassword: "supersecret1" },
  });
  assert.equal(again.status, 201, "the email is free to sign up again");
});

await test("Google-only accounts delete the same way", async () => {
  const googleOnly = await User.create({
    name: "Google Only",
    email: `google-only-${Date.now()}@example.com`,
    googleId: `google-only-${Date.now()}`,
  });
  const res = await api("/me", {
    method: "DELETE",
    token: generateToken(googleOnly._id.toString()),
    body: { confirm: "DELETE" },
  });
  assert.equal(res.status, 200);
  assert.equal(await User.countDocuments({ _id: googleOnly._id }), 0);
});

// ---------- public reader count ----------
const usageStats = await import("../src/services/usageStats.js");

await test("GET /api/stats reports the reader count", async () => {
  usageStats.clearStatsCache();
  const res = await api("/stats");
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.data, { readers: await User.countDocuments() });
});

await test("GET /api/stats is cached between visits", async () => {
  const before = (await api("/stats")).data.data.readers;
  await User.create({ name: "Counted Later", email: `counted-${Date.now()}@example.com`, googleId: `counted-${Date.now()}` });
  assert.equal((await api("/stats")).data.data.readers, before);
  usageStats.clearStatsCache();
  assert.equal((await api("/stats")).data.data.readers, before + 1);
});

// ---------- hardening ----------
await test("a crafted email cannot stall sign-up (no catastrophic regex)", async () => {
  const started = Date.now();
  const res = await api("/auth/register", {
    method: "POST",
    headers: { "X-Forwarded-For": "203.0.113.7" },
    body: {
      name: "Slow Loris",
      email: `${"a".repeat(60)}!`,
      password: "supersecret1",
      confirmPassword: "supersecret1",
    },
  });
  assert.equal(res.status, 400);
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started}ms`);
});

await test("sign-in fields must be text, never query objects", async () => {
  const login = await api("/auth/login", {
    method: "POST",
    headers: { "X-Forwarded-For": "203.0.113.8" },
    body: { email: { $ne: null }, password: "anything1" },
  });
  assert.equal(login.status, 400);

  const tooLong = await api("/auth/login", {
    method: "POST",
    headers: { "X-Forwarded-For": "203.0.113.8" },
    body: { email: "someone@example.com", password: "x".repeat(200) },
  });
  assert.equal(tooLong.status, 400);
});

await test("oversized request bodies are refused", async () => {
  const res = await api("/auth/login", {
    method: "POST",
    headers: { "X-Forwarded-For": "203.0.113.9" },
    body: { email: "someone@example.com", password: "p".repeat(200_000) },
  });
  assert.equal(res.status, 413);
});

await test("API responses are compressed when the client accepts it", async () => {
  const res = await fetch(`${baseUrl}/news?limit=50`, { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-encoding"), "gzip");
});

// ---------- teardown ----------
// A failing test does not throw here, so this always runs.
await News.deleteMany({});
server.close();
await disconnectDB();
await mongod.stop();
