/**
 * End-to-end verification against an in-memory MongoDB.
 *
 * Exercises the routes and the bugs that were fixed, using the real Express
 * app (no mocks). Run with: node scripts/verify.mjs
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import assert from "node:assert/strict";

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

const api = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
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
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri("cura-news-test");
  process.env.JWT_SECRET = "test-secret-that-is-definitely-long-enough-32";
  process.env.NODE_ENV = "test";
  process.env.CORS_ORIGIN = "http://localhost:3000";

  const { connectDB, disconnectDB } = await import("../src/config/database.js");
  await connectDB();

  const app = (await import("../src/app.js")).default;
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const News = (await import("../src/models/News.js")).default;
  const Note = (await import("../src/models/Note.js")).default;

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
    quiz: [
      {
        question: "Which body approved the education policy reform?",
        options: ["Union Cabinet", "Supreme Court", "Election Commission", "RBI"],
        answer: "A",
      },
      {
        question: "Which domain received additional funding?",
        options: ["Defense", "Secondary schools", "Space agency", "Agriculture only"],
        answer: "B",
      },
      {
        question: "When does the new certification process begin?",
        options: ["This year", "Next year", "In five years", "Never"],
        answer: "B",
      },
    ],
    url: "https://example.com/education-policy",
    date: new Date(),
    isPublished: true,
  });

  const articleId = article._id.toString();

  await check("detailed summary fields default safely", async () => {
    assert.equal(article.detailedStatus, "NONE");
    assert.equal(article.detailedSummary, null);
    assert.equal(article.detailSourceType, undefined);
  });

  // ---------- config / env ----------
  await check("dotenv/env config loads real values", async () => {
    const { config } = await import("../src/config/env.js");
    assert.equal(config.JWT_SECRET, process.env.JWT_SECRET);
    assert.equal(config.CORS_ORIGIN, "http://localhost:3000");
    assert.equal(config.OPENAI_MODEL, "gpt-4-turbo");
  });

  // ---------- auth ----------
  let token;
  let token2;
  const email = `student-${Date.now()}@example.com`;

  await check("register returns a usable token", async () => {
    const res = await api("/auth/register", {
      method: "POST",
      body: {
        name: "Test Student",
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

  await check("GET /news/:id strips quiz answers", async () => {
    const res = await api(`/news/${articleId}`);
    assert.equal(res.status, 200);
    assert.equal(res.data.data.quiz[0].answer, undefined);
    assert.ok(res.data.data.quiz[0].options);
  });

  await check("GET /news/:id?includeAnswers=true no longer leaks answers", async () => {
    const res = await api(`/news/${articleId}?includeAnswers=true`);
    assert.equal(res.status, 200);
    assert.equal(res.data.data.quiz[0].answer, undefined);
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

  await check("GET /news/fetch-daily requires auth (was public)", async () => {
    const res = await api("/news/fetch-daily");
    assert.equal(res.status, 401);
  });

  await check("POST /news/:id/detailed requires auth", async () => {
    const res = await api(`/news/${articleId}/detailed`, { method: "POST" });
    assert.equal(res.status, 401);
  });

  await check("GET /news/fetch-daily returns 202 when authed", async () => {
    const res = await api("/news/fetch-daily", { token });
    assert.equal(res.status, 202);
  });

  await check("GET /news/tag/:tag works", async () => {
    const res = await api("/news/tag/Polity");
    assert.equal(res.status, 200);
    assert.equal(res.data.data.length, 1);
  });

  // ---------- quiz answer leaks ----------
  await check("GET /quiz/:id/answers is gone (was public answer leak)", async () => {
    const res = await api(`/quiz/${articleId}/answers`);
    assert.equal(res.status, 404);
  });

  await check("GET /quiz/:id returns questions without answers", async () => {
    const res = await api(`/quiz/${articleId}`);
    assert.equal(res.status, 200);
    assert.equal(res.data.data.questions[0].answer, undefined);
  });

  await check("POST /quiz/submit scores and returns per-question review", async () => {
    const res = await api("/quiz/submit", {
      method: "POST",
      token,
      body: { articleId, answers: ["A", "B", "B"] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.score, 3);
    assert.equal(res.data.data.percentage, 100);
    assert.equal(res.data.data.questions[0].correctAnswer, "A");
    assert.equal(res.data.data.questions[0].isCorrect, true);
  });

  await check("POST /quiz/submit validates the answer array", async () => {
    const res = await api("/quiz/submit", {
      method: "POST",
      token,
      body: { articleId, answers: ["A"] },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.message, /Expected 3 answers/);
  });

  // ---------- notes: the ReferenceError bugs ----------
  await check("POST /notes works (was a guaranteed ReferenceError 500)", async () => {
    const res = await api("/notes", {
      method: "POST",
      token,
      body: {
        articleId,
        content: "The cabinet reform focuses on secondary school funding.",
        tags: ["policy"],
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.ok(res.data.data._id);
  });

  await check("POST /notes enforces the 10-char minimum", async () => {
    const res = await api("/notes", {
      method: "POST",
      token,
      body: { articleId, content: "short" },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.message, /at least 10 characters/);
  });

  await check("POST /notes rejects non-string content", async () => {
    const res = await api("/notes", {
      method: "POST",
      token,
      body: { articleId, content: 12345 },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.message, /must be a string/);
  });

  await check("POST /notes returns the author so the UI can group own notes", async () => {
    const res = await api("/notes", {
      method: "POST",
      token,
      body: { articleId, content: "Second note with enough characters." },
    });
    assert.equal(res.status, 201);
    assert.ok(res.data.data.userId?._id, "userId should be populated");
    assert.ok(res.data.data.userId?.name);
    assert.equal(res.data.data.userId.email, undefined, "email must not leak");
  });

  let myNoteId;
  await check("GET /notes returns only the caller's notes", async () => {
    const res = await api("/notes", { token });
    assert.equal(res.status, 200);
    assert.ok(res.data.data.length >= 2);
    myNoteId = res.data.data[0]._id;
  });

  await check("GET /notes/article/:id is paginated and email-free", async () => {
    const res = await api(`/notes/article/${articleId}`);
    assert.equal(res.status, 200);
    assert.ok(res.data.pagination, "must include pagination");
    assert.equal(res.data.data[0].userId.email, undefined);
  });

  // ---------- IDOR ----------
  await check("second user cannot read another user's note (IDOR fix)", async () => {
    const other = await api("/auth/register", {
      method: "POST",
      body: {
        name: "Other Student",
        email: `other-${Date.now()}@example.com`,
        password: "supersecret1",
        confirmPassword: "supersecret1",
      },
    });
    token2 = other.data.token;

    const res = await api(`/notes/note/${myNoteId}`, { token: token2 });
    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
  });

  await check("second user cannot update another user's note", async () => {
    const res = await api(`/notes/${myNoteId}`, {
      method: "PUT",
      token: token2,
      body: { content: "hijacked content that is long enough" },
    });
    assert.equal(res.status, 403);
  });

  await check("second user cannot delete another user's note", async () => {
    const res = await api(`/notes/${myNoteId}`, { method: "DELETE", token: token2 });
    assert.equal(res.status, 403);
  });

  await check("owner can update their own note", async () => {
    const res = await api(`/notes/${myNoteId}`, {
      method: "PUT",
      token,
      body: { content: "Updated note content that is long enough." },
    });
    assert.equal(res.status, 200);
    assert.match(res.data.data.content, /^Updated/);
  });

  await check("PUT /notes rejects a non-array tags value (was ReferenceError)", async () => {
    const res = await api(`/notes/${myNoteId}`, {
      method: "PUT",
      token,
      body: { tags: "not-an-array" },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.message, /array/i);
  });

  await check("PUT /notes rejects a non-boolean isPinned", async () => {
    const res = await api(`/notes/${myNoteId}`, {
      method: "PUT",
      token,
      body: { isPinned: "false" },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.message, /boolean/i);
  });

  await check("GET /notes/stats/overview works (was ReferenceError 500)", async () => {
    const res = await api("/notes/stats/overview", { token });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.ok(typeof res.data.data.totalNotes === "number");
  });

  await check("PATCH /notes/:id/pin toggles", async () => {
    const res = await api(`/notes/${myNoteId}/pin`, { method: "PATCH", token });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.isPinned, true);
  });

  // ---------- ai routes ----------
  await check("POST /ai/summarize requires auth (was public and billed)", async () => {
    const res = await api("/ai/summarize", {
      method: "POST",
      body: { articleText: "x".repeat(200) },
    });
    assert.equal(res.status, 401);
  });

  await check("POST /ai/batch-summarize requires auth", async () => {
    const res = await api("/ai/batch-summarize", {
      method: "POST",
      body: { articles: ["x".repeat(200)] },
    });
    assert.equal(res.status, 401);
  });

  await check("GET /ai/health is honest about being a config check", async () => {
    const res = await api("/ai/health");
    assert.equal(res.status, 200);
    assert.equal(
      res.data.data.status,
      res.data.data.apiKeyConfigured ? "configured" : "not_configured",
    );
  });

  // ---------- news create ----------
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

  await check("valid news with no quiz is retrievable", async () => {
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
    // An article with no quiz stores an empty array (Mongoose default),
    // which is what the frontend's `quiz?.questions?.length` check expects.
    assert.ok(Array.isArray(res.data.data.quiz));
    assert.equal(res.data.data.quiz.length, 0);
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
    category: "Politics",
    headline: "Parliament approves quantumledger digital payments amendment",
    summary:
      "The parliament approved the quantumledger amendment, which rewrites the settlement rules for digital payments across the country.",
    bulletPoints: ["Amendment text approved", "Settlement rules rewritten", "Rollout in two quarters"],
    tags: ["Polity"],
    date: new Date(),
  });

  const techArticle = await News.create({
    source: "Indian Express",
    category: "Tech",
    headline: "New semiconductor fabrication plant opens in Pune",
    summary:
      "A semiconductor fabrication plant began operations in Pune, adding capacity for advanced chip packaging in the country.",
    bulletPoints: ["Plant begins output", "Packaging capacity added", "Skilled hiring underway"],
    tags: ["Science"],
    date: new Date(),
  });

  await News.create({
    source: "Times of India",
    category: "Business",
    headline: "Sensex gains as quarterly profits rise across listed firms",
    summary:
      "The Sensex closed higher as quarterly profits rose across listed firms, with the banking index leading the advance.",
    bulletPoints: ["Index closed higher", "Banking index led", "Broader market firm"],
    tags: ["Economy"],
    date: new Date(),
  });

  await check("category defaults to Other when not supplied", async () => {
    const plain = await News.create({
      source: "The Hindu",
      headline: "Weather department issues advisory for coastal districts",
      summary:
        "The weather department issued an advisory about heavy rainfall expected along the coastline during the coming week.",
      bulletPoints: ["Advisory issued", "Heavy rainfall likely", "Coastal districts listed"],
      tags: ["Science"],
      date: new Date(),
    });
    assert.equal(plain.category, "Other");
  });

  await check("category derivation prefers the feed category over keywords", async () => {
    // "parliament" is a Politics keyword, but the feed says "business", and the
    // feed label must win.
    const result = resolveCategory({
      feedCategory: "business",
      text: "Parliament discussed the budget allocation in detail",
      aiCategory: "Tech",
    });
    assert.equal(result.category, "Business");
    assert.equal(result.derivedBy, "feed");
  });

  await check("category derivation falls back to keywords when the feed is unmapped", async () => {
    const result = resolveCategory({
      feedCategory: "general",
      text: "The parliament debated the new electoral reform bill",
      aiCategory: "Business",
    });
    assert.equal(result.category, "Politics");
    assert.equal(result.derivedBy, "keywords");
  });

  await check("category derivation uses the AI only as a last resort", async () => {
    // No feed label, and the keyword rules deliberately do not fire on this
    // text (\b-anchored, so "said" cannot match "ai" and "police" cannot match
    // any Politics term).
    const text = "Traffic was slow on the highway over the festival weekend, police said.";
    assert.equal(categoryFromKeywords(text), null, "fixture must not match any keyword rule");

    const result = resolveCategory({
      feedCategory: null,
      text,
      aiCategory: "Entertainment",
    });
    assert.equal(result.category, "Entertainment");
    assert.equal(result.derivedBy, "ai");
  });

  await check("category derivation lands on Other with nothing to go on", async () => {
    const result = resolveCategory({ feedCategory: "general", text: "zorb blimp" });
    assert.equal(result.category, "Other");
    assert.equal(result.derivedBy, "default");
  });

  await check("keyword matching is word-boundary safe", async () => {
    // "ai" must not match "said", "war" must not match "award".
    assert.equal(categoryFromKeywords("He said the plan was unclear"), null);
    assert.equal(categoryFromKeywords("They received an award for the war memoir"), null);
    assert.equal(categoryFromFeed("technology"), "Tech");
  });

  await check("GET /news?category= filters by category", async () => {
    const res = await api("/news?category=Tech");
    assert.equal(res.status, 200);
    assert.ok(res.data.data.length >= 1, "should find the Tech article");
    assert.ok(
      res.data.data.every((a) => a.category === "Tech"),
      "every returned article must be Tech",
    );
  });

  await check("GET /news combines search + category + source as AND", async () => {
    const hit = await api("/news?search=quantumledger&category=Politics&source=The%20Hindu");
    assert.equal(hit.status, 200);
    assert.equal(hit.data.data.length, 1, "all three filters should match one article");
    assert.equal(hit.data.data[0]._id, politicsArticle._id.toString());

    // The same search with a conflicting category must return nothing, which
    // proves the filters intersect rather than each overriding the last.
    const miss = await api("/news?search=quantumledger&category=Tech");
    assert.equal(miss.status, 200);
    assert.equal(miss.data.data.length, 0, "search + conflicting category should be empty");

    // And search combined with a conflicting source must also be empty.
    const missSource = await api(
      "/news?search=quantumledger&category=Politics&source=Indian%20Express",
    );
    assert.equal(missSource.data.data.length, 0, "conflicting source should be empty");
  });

  await check("GET /news rejects an unknown category instead of ignoring it", async () => {
    const res = await api("/news?category=Nonsense");
    assert.equal(res.status, 400);
    assert.match(res.data.message, /Invalid category/);
  });

  await check("GET /news returns category facets that survive the category filter", async () => {
    const res = await api("/news?category=Politics");
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
      res.data.facets.byCategory.Tech >= 1,
      "Tech facet should still be counted while Politics is selected",
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
      category: "Business",
    };

    const ok = await api("/news", { method: "POST", token, body: payload });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.data.category, "Business");

    const bad = await api("/news", {
      method: "POST",
      token,
      body: { ...payload, category: "Nonsense" },
    });
    assert.equal(bad.status, 400);
    assert.match(bad.data.message, /Invalid category/);
  });

  // ---------- teardown ----------
  await Note.deleteMany({});
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