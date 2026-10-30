/**
 * AI Summarization Service
 * Converts raw news articles from various sources into structured summaries
 * Uses Gemini (primary) / Groq (fallback) with structured JSON output
 */

import axios from "axios";
import { config } from "../config/env.js";

const env = config;

/** Message for every "no AI capacity right now" outcome; callers match on it. */
export const RATE_LIMITED_MESSAGE = "AI providers are temporarily rate-limited";

// ---------------------------------------------------------------------------
// Provider scheduling
//
// Every AI call goes through generateStructured, which picks a provider per
// call rather than always hitting the primary first:
//
//  - Each provider has its own cooldown. A 429 from Gemini never blocks Groq,
//    and the provider's own retry hint is honoured (Gemini's free tier answers
//    a used-up daily quota with "retry in 18h"; retrying sooner only fails).
//  - Calls are paced to stay inside the limits, so 429s are rare: a
//    requests-per-minute window per provider, plus the token-per-minute and
//    request-per-day budgets Groq reports in its response headers.
//  - Readers come first. Background work (ingest, the detailed batch) leaves a
//    reserve of capacity untouched and pauses while a reader is waiting, so a
//    burst of ingestion cannot make a reader's request fail.
//
// State is in memory: a restart clears it and the next calls re-learn limits.
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000;
// Without a retry hint: 30s, doubling per consecutive 429, capped at 5 min.
const BASE_COOLDOWN_MS = 30_000;
const MAX_DEFAULT_COOLDOWN_MS = 5 * MINUTE_MS;
const MAX_COOLDOWN_MS = 24 * 60 * MINUTE_MS;
// How long a call may wait for capacity before giving up with a 429.
const INTERACTIVE_MAX_WAIT_MS = 20_000;
const BACKGROUND_MAX_WAIT_MS = 3 * MINUTE_MS;
// Per-minute request slots background calls leave free for readers.
const INTERACTIVE_RPM_RESERVE = 2;
const MAX_PROVIDER_ATTEMPTS = 4;

const createProviderState = () => ({
  cooldownUntil: 0,
  strikes: 0,
  recentCalls: [], // dispatch times within the last minute
  pendingTokens: 0, // estimated tokens of calls still in flight
  tokens: null, // per-minute token budget, from response headers
  requests: null, // per-day request budget, from response headers
});

let providerState = {
  gemini: createProviderState(),
  groq: createProviderState(),
};
let readersWaiting = 0;

/** Forget every cooldown and learned limit. Used by the test suite. */
export const resetAiRateState = () => {
  providerState = { gemini: createProviderState(), groq: createProviderState() };
  readersWaiting = 0;
};

const PROVIDERS = {
  gemini: {
    isConfigured: () => Boolean(env.GEMINI_API_KEY),
    model: () => env.GEMINI_MODEL,
    rpm: () => env.GEMINI_RPM,
    async call({ systemPrompt, userPrompt, maxTokens, temperature }) {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
        { timeout: 30000 },
      );
      const candidate = response.data?.candidates?.[0];
      return {
        content: candidate?.content?.parts?.[0]?.text,
        finishReason: candidate?.finishReason,
        headers: response.headers,
      };
    },
  },
  groq: {
    isConfigured: () => Boolean(env.GROQ_API_KEY),
    model: () => env.GROQ_MODEL,
    rpm: () => env.GROQ_RPM,
    async call({ systemPrompt, userPrompt, maxTokens, temperature }) {
      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: env.GROQ_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
          // gpt-oss models reason before answering, and at the default effort
          // that reasoning can use the whole max_tokens budget, leaving an
          // empty answer (finish_reason "length"). Low effort answers these
          // structured tasks in a few hundred tokens.
          ...(/gpt-oss/i.test(env.GROQ_MODEL) ? { reasoning_effort: "low" } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );
      const choice = response.data?.choices?.[0];
      return {
        content: choice?.message?.content,
        finishReason: choice?.finish_reason,
        headers: response.headers,
      };
    },
  },
};

/** Configured providers, preferred (AI_PROVIDER) first. */
const providerOrder = () => {
  const primary = env.AI_PROVIDER.toLowerCase() === "groq" ? "groq" : "gemini";
  const fallback = primary === "groq" ? "gemini" : "groq";
  return [primary, fallback].filter((name) => PROVIDERS[name].isConfigured());
};

/**
 * Parse a provider duration into milliseconds: "615ms", "7.66s", "18m43.2s",
 * "65310s", or a bare number of seconds (the Retry-After header).
 */
const parseDurationMs = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(parseFloat(text) * 1000);
  const unitMs = { ms: 1, s: 1000, m: MINUTE_MS, h: 60 * MINUTE_MS };
  let total = 0;
  let matched = false;
  for (const [, amount, unit] of text.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    matched = true;
    total += parseFloat(amount) * unitMs[unit];
  }
  return matched ? Math.round(total) : null;
};

/**
 * A rolling budget from Groq's x-ratelimit-* headers: `kind` is "tokens"
 * (per minute) or "requests" (per day). Both refill continuously, reaching
 * the limit again after the reported reset time.
 */
const readBucket = (headers, kind, now) => {
  const limit = Number(headers?.[`x-ratelimit-limit-${kind}`]);
  const remaining = Number(headers?.[`x-ratelimit-remaining-${kind}`]);
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(remaining)) {
    return null;
  }
  const resetMs = parseDurationMs(headers[`x-ratelimit-reset-${kind}`]) ?? 0;
  return { limit, remaining, measuredAt: now, fullAt: now + resetMs };
};

const bucketLevel = (bucket, now) => {
  if (now >= bucket.fullAt) return bucket.limit;
  const progress = (now - bucket.measuredAt) / (bucket.fullAt - bucket.measuredAt);
  return bucket.remaining + (bucket.limit - bucket.remaining) * progress;
};

/** Milliseconds until `bucket` holds `needed` units; 0 when unknown or enough. */
const bucketWaitMs = (bucket, needed, now) => {
  if (!bucket) return 0;
  const target = Math.min(needed, bucket.limit);
  const level = bucketLevel(bucket, now);
  if (level >= target) return 0;
  const refillPerMs =
    (bucket.limit - bucket.remaining) / (bucket.fullAt - bucket.measuredAt);
  return Math.ceil((target - level) / refillPerMs);
};

const updateBuckets = (name, headers, now) => {
  const state = providerState[name];
  state.tokens = readBucket(headers, "tokens", now) ?? state.tokens;
  state.requests = readBucket(headers, "requests", now) ?? state.requests;
};

/** Rough size of a call as providers count it: prompt (~4 chars/token) plus the output allowance. */
const estimateTokens = (systemPrompt, userPrompt, maxTokens) =>
  Math.ceil((String(systemPrompt).length + String(userPrompt).length) / 4) + maxTokens;

/** Milliseconds until `name` can take a call of this priority and size (0 = now). */
const providerWaitMs = (name, priority, estimate, now) => {
  const state = providerState[name];
  const reader = priority === "interactive";
  let wait = Math.max(0, state.cooldownUntil - now);

  state.recentCalls = state.recentCalls.filter((at) => now - at < MINUTE_MS);
  const rpm = Math.max(1, Number(PROVIDERS[name].rpm()) || 1);
  const rpmLimit = reader ? rpm : Math.max(1, rpm - INTERACTIVE_RPM_RESERVE);
  if (state.recentCalls.length >= rpmLimit) {
    const freesSlot = state.recentCalls[state.recentCalls.length - rpmLimit];
    wait = Math.max(wait, freesSlot + MINUTE_MS - now);
  }

  const tokenReserve = reader ? 0 : env.AI_INTERACTIVE_TOKEN_RESERVE;
  wait = Math.max(
    wait,
    bucketWaitMs(state.tokens, estimate + state.pendingTokens + tokenReserve, now),
  );
  const requestReserve = reader ? 0 : env.AI_INTERACTIVE_REQUEST_RESERVE;
  wait = Math.max(wait, bucketWaitMs(state.requests, 1 + requestReserve, now));
  return wait;
};

const rateLimitedError = (retryAfterMs, detail) => {
  const error = new Error(detail ? `${RATE_LIMITED_MESSAGE}: ${detail}` : RATE_LIMITED_MESSAGE);
  error.statusCode = 429;
  error.retryAfterMs = Number.isFinite(retryAfterMs) ? Math.ceil(retryAfterMs) : null;
  return error;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether a call of this priority could start within its wait limit, without
 * making one. Lets callers skip expensive prep (fetching the article page)
 * when the answer would be a 429 anyway.
 *
 * @param {"interactive"|"background"} [priority]
 * @returns {{ available: boolean, retryAfterMs: number|null }}
 */
export const getAiAvailability = (priority = "interactive") => {
  const order = providerOrder();
  if (!order.length) return { available: false, retryAfterMs: null };
  const now = Date.now();
  const soonest = Math.min(...order.map((name) => providerWaitMs(name, priority, 0, now)));
  const maxWait = priority === "interactive" ? INTERACTIVE_MAX_WAIT_MS : BACKGROUND_MAX_WAIT_MS;
  return { available: soonest <= maxWait, retryAfterMs: soonest };
};

/**
 * Wait for a provider with capacity and reserve it. Throws a 429 straight away
 * when the wait would exceed the priority's limit, rather than sleeping first.
 */
const acquireProvider = async (priority, estimate, excluded) => {
  const reader = priority === "interactive";
  const deadline = Date.now() + (reader ? INTERACTIVE_MAX_WAIT_MS : BACKGROUND_MAX_WAIT_MS);
  if (reader) readersWaiting += 1;
  try {
    for (;;) {
      const candidates = providerOrder().filter((name) => !excluded.has(name));
      if (!candidates.length) return null;

      const now = Date.now();
      const waits = candidates.map((name) => providerWaitMs(name, priority, estimate, now));
      // Background work steps aside while any reader is queued.
      const mustYield = !reader && readersWaiting > 0;
      const ready = mustYield ? -1 : waits.indexOf(0);
      if (ready !== -1) {
        const name = candidates[ready];
        providerState[name].recentCalls.push(now);
        providerState[name].pendingTokens += estimate;
        return name;
      }

      const soonest = Math.min(...waits);
      if (now + soonest > deadline) {
        throw rateLimitedError(soonest);
      }
      // Re-check at least every second: calls finishing or a reader arriving
      // can change the answer before the computed wait is over.
      await sleep(Math.min(Math.max(soonest, 250), 1000));
    }
  } finally {
    if (reader) readersWaiting -= 1;
  }
};

const isRateLimitError = (error) =>
  error?.response?.status === 429 || error?.status === 429;

/** Retry hint of a 429: Retry-After header, Gemini RetryInfo, or "retry in 7.5s" text. */
const retryHintMs = (error) => {
  const fromHeader = parseDurationMs(error?.response?.headers?.["retry-after"]);
  if (fromHeader) return fromHeader;
  const body = error?.response?.data?.error;
  const retryInfo = Array.isArray(body?.details)
    ? body.details.find((detail) => String(detail?.["@type"]).endsWith("RetryInfo"))
    : null;
  const fromRetryInfo = parseDurationMs(retryInfo?.retryDelay);
  if (fromRetryInfo) return fromRetryInfo;
  const message = typeof body === "string" ? body : body?.message || "";
  const match = String(message).match(/(?:retry|try again) in ([\d.hms]+)/i);
  return match ? parseDurationMs(match[1]) : null;
};

const markRateLimited = (name, error, now) => {
  const state = providerState[name];
  state.strikes += 1;
  const hinted = retryHintMs(error);
  const cooldownMs = Math.min(
    Math.max(
      hinted ?? Math.min(BASE_COOLDOWN_MS * 2 ** (state.strikes - 1), MAX_DEFAULT_COOLDOWN_MS),
      1000,
    ),
    MAX_COOLDOWN_MS,
  );
  state.cooldownUntil = Math.max(state.cooldownUntil, now + cooldownMs);
  console.warn(
    `AI provider ${name} rate-limited; pausing it for ${Math.round(cooldownMs / 1000)}s`,
  );
};

/**
 * Generate and parse a structured JSON response using the shared AI client.
 *
 * Picks the provider per call (see "Provider scheduling" above): the
 * preferred one when it has capacity, otherwise the other. Throws an error
 * with statusCode 429 and `retryAfterMs` when no provider can take the call
 * within the wait limit for its priority.
 *
 * @param {Object} params
 * @param {"interactive"|"background"} [params.priority] - "interactive" for a
 *   reader waiting on the answer; "background" (default) for ingest and batch
 *   work, which leaves capacity free for readers and waits longer.
 */
export async function generateStructured({
  systemPrompt,
  userPrompt,
  maxTokens = 1800,
  temperature = 0.2,
  priority = "background",
}) {
  if (!providerOrder().length) {
    throw new Error("No AI provider is configured (set GEMINI_API_KEY or GROQ_API_KEY)");
  }

  const estimate = estimateTokens(systemPrompt, userPrompt, maxTokens);
  // Providers that failed for a reason other than rate limiting are not
  // retried within this call; rate-limited ones may be, after their cooldown.
  const failed = new Set();
  const failures = [];
  let rateLimited = false;
  let content;
  let finishReason;
  let answeredBy;

  for (let attempt = 0; attempt < MAX_PROVIDER_ATTEMPTS && !answeredBy; attempt += 1) {
    const name = await acquireProvider(priority, estimate, failed);
    if (!name) break;

    try {
      const result = await PROVIDERS[name].call({
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
      });
      updateBuckets(name, result.headers, Date.now());
      providerState[name].strikes = 0;
      content = result.content;
      finishReason = result.finishReason;
      answeredBy = name;
    } catch (error) {
      const now = Date.now();
      updateBuckets(name, error?.response?.headers, now);
      failures.push(`${name}=${error.message}`);
      if (isRateLimitError(error)) {
        rateLimited = true;
        markRateLimited(name, error, now);
      } else {
        failed.add(name);
      }
    } finally {
      providerState[name].pendingTokens -= estimate;
    }
  }

  if (!answeredBy) {
    if (rateLimited) {
      throw rateLimitedError(getAiAvailability(priority).retryAfterMs, failures.join("; "));
    }
    throw new Error(`AI providers failed: ${failures.join("; ")}`);
  }

  if (!content || typeof content !== "string") {
    throw new Error(
      `AI returned an empty structured response (${answeredBy}, finish reason: ${finishReason || "unknown"})`,
    );
  }

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const parsed = parseJsonLenient(fenced ? fenced[1] : content);
  Object.defineProperty(parsed, "__aiMeta", {
    value: { provider: answeredBy, modelUsed: PROVIDERS[answeredBy].model() },
    enumerable: false,
  });
  return parsed;
}

/**
 * Parse JSON, repairing raw control characters that appear inside string
 * literals. Gemini runs in JSON mode, but the Groq fallback does not, and a
 * model that emits a real newline inside a "detailed" paragraph produces
 * unterminated-string errors. This scanner walks the text, tracks whether it
 * is inside a string literal, and escapes control characters only there -
 * leaving whitespace between tokens untouched.
 */
function parseJsonLenient(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch (initialError) {
    let out = "";
    let inString = false;
    let escaped = false;
    for (const ch of raw) {
      if (inString) {
        if (escaped) {
          out += ch;
          escaped = false;
        } else if (ch === "\\") {
          out += ch;
          escaped = true;
        } else if (ch === '"') {
          out += ch;
          inString = false;
        } else if (ch === "\n") {
          out += "\\n";
        } else if (ch === "\r") {
          out += "\\r";
        } else if (ch === "\t") {
          out += "\\t";
        } else if (ch.charCodeAt(0) < 0x20) {
          out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
        } else {
          out += ch;
        }
      } else {
        if (ch === '"') {
          inString = true;
        }
        out += ch;
      }
    }
    return JSON.parse(out);
  }
}
