/**
 * End-to-end verification against an in-memory MongoDB.
 *
 * Exercises the routes and the bugs that were fixed, using the real Express
 * app (no mocks). Run with: node scripts/verify.mjs
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import assert from "node:assert/strict";
import axios from "axios";
import { formatDetailedText } from "../src/utils/formatDetailedText.js";

let mongod;
let baseUrl;
let pass = 0;
let fail = 0;

const results = [];

const check = async (name, fn) => {
  try {
    await fn();
    pass++;
    results.push(`  PASS  ${name}`);
  } catch (error) {
    fail++;
    results.push(`  FAIL  ${name}\n          ${error.message}`);
  }
};

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

async function main() {
  await check("detailed text formatter repairs spacing and sentence-safe paragraphs", async () => {
    const result = formatDetailedText(
      "The RSS (RSS)concluded its celebrations. It has grown rapidly while one\nof the 32 organisations it inspired expanded over the last decade. Its legacy remains contested among scholars and policymakers. Supporters cite service and reach. Critics cite exclusion and narrow leadership. The debate continues across conferences and journals. Reformers argue the network should widen its base before it plans its next cycle of expansion. Others insist that the original mission still binds the group. Both sides agree that the numbers now matter more than the arguments. Whatever the committee decides, the outcome will shape how the organisation is remembered by the people who built it.",
    );
    assert.equal(result.valid, true);
    assert.match(result.text, /\(RSS\) concluded/);
    assert.equal(result.paragraphs.length, 2);
    result.paragraphs.forEach((paragraph) => assert.match(paragraph, /[.!?]["'»”’)\]]?$/));
  });

  await check("detailed text formatter preserves decimals and abbreviations", async () => {
    const result = formatDetailedText(
      "The report cites Rs.5.2 crore and 3.5% growth in the eastern districts. U.S. officials referred to e.g. No. 1 priorities in the review meeting. A. P. J. Abdul Kalam remains widely remembered across the country. The audit team said the figure was provisional. Officials said the final number would be published next quarter. Two departments confirmed the same total independently. The commission noted that early estimates had ranged widely. Many analysts had warned that the collection cycle was incomplete. The ministry published the underlying data alongside the statement. The final tally nonetheless matched the lower projection. The regional offices had reported a similar pattern earlier.",
    );
    assert.equal(result.valid, true);
    assert.match(result.text, /Rs\.5\.2 crore/);
    assert.match(result.text, /3\.5%/);
    assert.match(result.text, /U\.S\./);
    assert.match(result.text, /e\.g\./);
    assert.match(result.text, /No\. 1/);
    assert.match(result.text, /A\. P\. J\. Abdul Kalam/);
  });

  await check("detailed text formatter rejects truncated output", async () => {
    assert.deepEqual(formatDetailedText("The final sentence is incomplete"), {
      valid: false,
      reason: "truncated",
    });
  });

  await check("detailed text formatter rejects a narrative outside the word budget", async () => {
    const result = formatDetailedText("A short sentence. Another one.");
    assert.equal(result.valid, false);
    assert.equal(result.reason, "detailed must be 100-120 words");
  });

  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri("cura-news-test");
  process.env.JWT_SECRET = "test-secret-that-is-definitely-long-enough-32";
  process.env.NODE_ENV = "test";
  process.env.CORS_ORIGIN = "http://localhost:3000";
  process.env.CRON_SECRET = "test-cron-secret";
  // Pinned explicitly: dotenv does not override already-set vars, so these win
  // over any local .env and the assertions below stay deterministic.
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_MODEL = "gemini-3.8-flash";
  // Fake AI keys: both providers count as configured, but nothing in the suite
  // can spend real quota. Tests that need AI replies stub axios.post.
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GROQ_API_KEY = "test-groq-key";
  process.env.GEMINI_RPM = "10";
  process.env.GROQ_RPM = "30";

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

  await check("cleanup deletes old articles but keeps today's articles", async () => {
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

  await check("article extractor proceeds when robots returns 403, timeout, or null", async () => {
    const { extractArticleText } = await import("../src/services/articleTextExtractor.js");
    const originalGet = axios.get;
    const html = `<html><body><article>${"Readable article text ".repeat(100)}</article></body></html>`;
    try {
      for (const robotsResult of [
        { status: 403, data: "" },
        new Error("timeout"),
        null,
      ]) {
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

  await check("detailed summary fields default safely", async () => {
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

  await check("a Gemini 429 does not block Groq, and Gemini's retry hint is honoured", async () => {
    stubAi({ gemini: geminiDailyQuotaUsed, groq: () => aiReply("groq", { ok: 1 }) });
    try {
      const first = await askAi("interactive");
      assert.equal(first.ok, 1);
      assert.equal(first.__aiMeta.provider, "groq");
      assert.equal(first.__aiMeta.modelUsed, aiEnv.GROQ_MODEL);
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

  await check("a reader is not kept waiting when every provider is rate-limited for long", async () => {
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

  await check("a short provider cooldown is waited out for a reader", async () => {
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

  await check("background work leaves Groq's token reserve for readers", async () => {
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

  // ---------- config / env ----------
  await check("dotenv/env config loads real values", async () => {
    const { config } = await import("../src/config/env.js");
    assert.equal(config.JWT_SECRET, process.env.JWT_SECRET);
    assert.equal(config.CORS_ORIGIN, "http://localhost:3000");
    // The providers that actually back AI_PROVIDER. OPENAI_MODEL used to be
    // asserted here, but no code path calls OpenAI any more.
    assert.equal(config.AI_PROVIDER, "gemini");
    assert.equal(config.GEMINI_MODEL, "gemini-3.8-flash");
    assert.equal(config.OPENAI_MODEL, undefined);
    assert.equal(config.NEWS_API_KEY, undefined);
  });

  // ---------- auth ----------
  let token;
  const email = `reader-${Date.now()}@example.com`;

  await check("register returns a usable token", async () => {
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

  await check("register rejects mismatched confirmation", async () => {
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

  await check("register enforces 8-char minimum password", async () => {
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

  await check("login works and /auth/me resolves", async () => {
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

  await check("login gives no user-enumeration signal", async () => {
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

  await check("Google sign-in answers 503 when GOOGLE_CLIENT_ID is unset", async () => {
    appConfig.GOOGLE_CLIENT_ID = "";
    const res = await googleAuth();
    assert.equal(res.status, 503);
    appConfig.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    tokenAudience = appConfig.GOOGLE_CLIENT_ID;
  });

  await check("Google sign-in rejects an invalid or missing credential", async () => {
    googlePayload = null;
    assert.equal((await googleAuth()).status, 401);
    assert.equal((await googleAuth("")).status, 400);
  });

  await check("Google sign-in rejects a token issued to another app", async () => {
    googlePayload = googleUser;
    tokenAudience = "someone-elses-app.apps.googleusercontent.com";
    assert.equal((await googleAuth()).status, 401);
    tokenAudience = appConfig.GOOGLE_CLIENT_ID;
  });

  await check("Google sign-in rejects an unverified email", async () => {
    googlePayload = { ...googleUser, email_verified: false };
    assert.equal((await googleAuth()).status, 401);
  });

  let googleUserId;
  await check("Google sign-in creates an account and returns a working token", async () => {
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

  await check("Google sign-in again reuses the same account", async () => {
    googlePayload = { ...googleUser, email: "renamed@example.com" };
    const res = await googleAuth();
    assert.equal(res.status, 200);
    assert.equal(res.data.user.id, googleUserId);
  });

  await check("Google sign-in links to an existing password account by email", async () => {
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

  await check("password login to a Google-only account is a plain 401", async () => {
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

  await check("garbage token is rejected", async () => {
    const res = await api("/auth/me", { token: "not-a-real-token" });
    assert.equal(res.status, 401);
  });

  // ---------- news reads ----------
  await check("GET /news returns the article with real field names", async () => {
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

  await check("GET /news paginates with limit/skip", async () => {
    const res = await api("/news?limit=1&skip=0");
    assert.equal(res.status, 200);
    assert.equal(res.data.pagination.limit, 1);
    assert.equal(res.data.pagination.total, 1);
  });

  await check("GET /news?tags= filters by tag", async () => {
    const res = await api("/news?tags=Economy");
    assert.equal(res.data.data.length, 1);
    const none = await api("/news?tags=Science");
    assert.equal(none.data.data.length, 0);
  });

  await check("GET /news/:id returns the article without quiz data", async () => {
    const res = await api(`/news/${articleId}`);
    assert.equal(res.status, 200);
    assert.equal(res.data.data.quiz, undefined);
    assert.ok(res.data.data.headline);
  });

  await check("GET /news/:id rejects a malformed id", async () => {
    const res = await api("/news/not-an-id");
    assert.equal(res.status, 400);
  });

  // ---------- route shadowing (the /:id vs /search + /fetch-daily bug) ----------
  await check("GET /news/search is reachable (not shadowed by /:id)", async () => {
    const res = await api("/news/search?q=education");
    assert.equal(res.status, 200, `got ${res.status} - route is shadowed`);
    assert.equal(res.data.data.length, 1);
  });

  await check("GET /news/search returns pagination", async () => {
    const res = await api("/news/search?q=education");
    assert.ok(res.data.pagination, "search must include pagination");
    assert.equal(typeof res.data.pagination.total, "number");
  });

  await check("GET /news/stats/overview is reachable", async () => {
    const res = await api("/news/stats/overview");
    assert.equal(res.status, 200);
    assert.equal(res.data.data.totalArticles, 1);
    assert.equal(res.data.data.bySource["The Hindu"], 1);
    assert.equal(res.data.data.byTag.Polity, 1);
  });

  await check("GET /news/fetch-daily is removed", async () => {
    const res = await api("/news/fetch-daily");
    assert.equal(res.status, 404);
  });

  await check("POST /admin/ingest rejects an invalid cron secret", async () => {
    const res = await api("/admin/ingest", {
      method: "POST",
      headers: { "x-cron-secret": "wrong-secret" },
      body: {},
    });
    assert.equal(res.status, 401);
  });

  await check("POST /news/:id/detailed requires auth", async () => {
    const res = await api(`/news/${articleId}/detailed`, { method: "POST" });
    assert.equal(res.status, 401);
  });

  await check("a rate-limited detailed request answers 429 and keeps the article retryable", async () => {
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

  await check("POST /admin/ingest returns 202 with the cron secret", async () => {
    const res = await api("/admin/ingest", {
      method: "POST",
      headers: { "x-cron-secret": "test-cron-secret" },
      body: { dryRun: true },
    });
    assert.equal(res.status, 202);
  });

  await check("GET /news/tag/:tag works", async () => {
    const res = await api("/news/tag/Polity");
    assert.equal(res.status, 200);
    assert.equal(res.data.data.length, 1);
  });

  // ---------- quiz routes removed ----------
  await check("GET /quiz/:id is gone (quiz feature removed)", async () => {
    const res = await api(`/quiz/${articleId}`);
    assert.equal(res.status, 404);
  });

  await check("POST /quiz/submit is gone (quiz feature removed)", async () => {
    const res = await api("/quiz/submit", {
      method: "POST",
      token,
      body: { articleId, answers: ["A"] },
    });
    assert.equal(res.status, 404);
  });

  // ---------- notes feature removed ----------
  await check("GET /notes is gone (notes feature removed)", async () => {
    const res = await api("/notes", { token });
    assert.equal(res.status, 404);
  });

  await check("POST /notes is gone (notes feature removed)", async () => {
    const res = await api("/notes", {
      method: "POST",
      token,
      body: { articleId, content: "Notes no longer exist in this build." },
    });
    assert.equal(res.status, 404);
  });

  await check("GET /notes/article/:id is gone (notes feature removed)", async () => {
    const res = await api(`/notes/article/${articleId}`);
    assert.equal(res.status, 404);
  });

  // ---------- ai routes ----------
  await check("POST /news requires auth (was public)", async () => {
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

  await check("POST /news rejects an invalid source enum", async () => {
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
  await check("auth endpoints are rate limited (brute-force mitigation)", async () => {
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
  await check("unknown route returns 404 JSON", async () => {
    const res = await api("/does-not-exist");
    assert.equal(res.status, 404);
    assert.equal(res.data.success, false);
  });

  await check("plain news article is retrievable", async () => {
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

  await check("UTC day boundary: article from yesterday is not 'today'", async () => {
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

  await check("category defaults to Misc when not supplied", async () => {
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

  await check("category derivation prefers the feed category over keywords", async () => {
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

  await check("category derivation falls back to keywords when the feed is unmapped", async () => {
    const result = resolveCategory({
      feedCategory: "general",
      text: "The parliament debated the new electoral reform bill",
      aiCategory: "Economy & Business",
    });
    assert.equal(result.category, "Politics & Governance");
    assert.equal(result.derivedBy, "keywords");
  });

  await check("category derivation uses the AI only as a last resort", async () => {
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

  await check("category derivation lands on Misc with nothing to go on", async () => {
    const result = resolveCategory({ feedCategory: "general", text: "zorb blimp" });
    assert.equal(result.category, "Misc");
    assert.equal(result.derivedBy, "default");
  });

  await check("keyword matching is word-boundary safe", async () => {
    // "ai" must not match "said", "war" must not match "award".
    assert.equal(categoryFromKeywords("He said the plan was unclear"), null);
    assert.equal(categoryFromKeywords("They received an award for the war memoir"), null);
    assert.equal(categoryFromFeed("technology"), "Science & Technology");
  });

  await check("GET /news?category= filters by category", async () => {
    const res = await api("/news?category=Science%20%26%20Technology");
    assert.equal(res.status, 200);
    assert.ok(res.data.data.length >= 1, "should find the Tech article");
    assert.ok(
      res.data.data.every((a) => a.category === "Science & Technology"),
      "every returned article must be Tech",
    );
  });

  await check("GET /news combines search + category + source as AND", async () => {
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

  await check("GET /news rejects an unknown category instead of ignoring it", async () => {
    const res = await api("/news?category=Nonsense");
    assert.equal(res.status, 400);
    assert.match(res.data.message, /Invalid category/);
  });

  await check("GET /news returns category facets that survive the category filter", async () => {
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

  await check("POST /news accepts a valid category and rejects an invalid one", async () => {
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

  await check("saving a bookmark sets a 24h expiry and stores a snapshot", async () => {
    const res = await api(`/bookmarks/${saved._id}`, { method: "POST", token });
    assert.equal(res.status, 200);
    const bookmark = await Bookmark.findOne({ article: saved._id }).lean();
    assert.equal(bookmark.snapshot.headline, saved.headline);
    const hoursLeft = (bookmark.expiresAt - Date.now()) / 3600000;
    assert.ok(hoursLeft > 23.9 && hoursLeft <= 24, `expiry was ${hoursLeft}h away`);
  });

  await check("re-saving a bookmark does not extend its expiry", async () => {
    const before = (await Bookmark.findOne({ article: saved._id }).lean()).expiresAt;
    await api(`/bookmarks/${saved._id}`, { method: "POST", token });
    const after = (await Bookmark.findOne({ article: saved._id }).lean()).expiresAt;
    assert.equal(after.getTime(), before.getTime());
  });

  await check("deleting articles refreshes the snapshot, and the bookmark stays readable", async () => {
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

  await check("an expired bookmark is hidden before the TTL monitor removes it", async () => {
    await Bookmark.updateOne({ article: saved._id }, { expiresAt: new Date(Date.now() - 1000) });
    const list = await api("/bookmarks", { token });
    assert.equal(list.data.pagination.total, 0);
    assert.equal(list.data.data.length, 0);
    const one = await api(`/bookmarks/${saved._id}`, { token });
    assert.equal(one.status, 404);
    const status = await api(`/bookmarks/${saved._id}/status`, { token });
    assert.equal(status.data.data.bookmarked, false);
  });

  await check("bookmark expiry is backed by a TTL index", async () => {
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

  await check("new accounts start without picks, and For You asks for them", async () => {
    const me = await api("/auth/me", { token: picker.token });
    assert.deepEqual(me.data.user.preferences, { sources: [], topics: [], onboardedAt: null });
    assert.equal(me.data.user.hasPassword, true);
    assert.equal(me.data.user.hasGoogle, false);

    const feed = await api("/news/for-you", { token: picker.token });
    assert.equal(feed.status, 409);
  });

  await check("picks are validated", async () => {
    const save = (body) => api("/me/preferences", { method: "PUT", token: picker.token, body });
    assert.equal((await save({ sources: ["The Daily Planet"], topics: ["sports"] })).status, 400);
    assert.equal((await save({ sources: ["The Hindu"], topics: [] })).status, 400);
    assert.equal((await save({ sources: "The Hindu", topics: ["sports"] })).status, 400);
    assert.equal((await save({ sources: ["The Hindu"], topics: ["astrology"] })).status, 400);
  });

  await check("saved picks show up on the account", async () => {
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

  await check("For You holds only the picked sources AND topics", async () => {
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

  await check("card filters narrow For You but never widen it", async () => {
    const sports = await api("/news/for-you?topic=Sports&limit=100", { token: picker.token });
    assert.ok(sports.data.data.length > 0);
    assert.ok(sports.data.data.every((article) => article.category === "Sports"));

    const health = await api("/news/for-you?topic=Health", { token: picker.token });
    assert.equal(health.status, 200);
    assert.equal(health.data.pagination.total, 0);

    const toi = await api("/news/for-you?source=Times%20of%20India", { token: picker.token });
    assert.equal(toi.data.pagination.total, 0);
  });

  await check("skipping the picker is remembered without inventing picks", async () => {
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

  await check("deleting an account needs the confirm flag", async () => {
    const reader = await registerReader("careful");
    const res = await api("/me", { method: "DELETE", token: reader.token, body: {} });
    assert.equal(res.status, 400);
    assert.equal((await api("/auth/me", { token: reader.token })).status, 200, "still active");
  });

  await check("deleting an account removes it and its saved articles for good", async () => {
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

  await check("Google-only accounts delete the same way", async () => {
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

  // ---------- teardown ----------
  await News.deleteMany({});

  server.close();
  await disconnectDB();
  await mongod.stop();

  console.log("\n" + results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error("\nVerification harness crashed:", error);
  console.log(results.join("\n"));
  try {
    await mongod?.stop();
  } catch {
    /* ignore */
  }
  process.exit(1);
});