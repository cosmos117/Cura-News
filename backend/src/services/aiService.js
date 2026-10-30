/**
 * AI service: one entry point (generateStructured) over a pool of free models
 * from Groq and Gemini, returning parsed JSON.
 */

import axios from "axios";
import { config } from "../config/env.js";

const env = config;

/** Message for every "no AI capacity right now" outcome; callers match on it. */
export const RATE_LIMITED_MESSAGE = "AI providers are temporarily rate-limited";

// ---------------------------------------------------------------------------
// Model pool
//
// Free tiers limit each MODEL separately, so every model on a key is its own
// slot with its own quota. A call goes to the first slot, in preference order,
// that has room right now:
//
//  - Each slot has its own cooldown. A 429 honours the provider's retry hint
//    (Gemini answers a used-up daily quota with "retry in 13h"), so a spent
//    model is skipped instead of retried.
//  - Calls are paced per slot: requests per minute, plus Groq's tokens-per-
//    minute and requests-per-day budgets read from its response headers.
//  - Models that no longer exist ("not found", "decommissioned") are disabled
//    for a few hours and logged, so a stale model list cannot break anything.
//  - Readers come first: background work leaves capacity free and pauses
//    while a reader is waiting.
//
// State is in memory: a restart clears it and the next calls re-learn limits.
// ---------------------------------------------------------------------------

// Free-tier models measured on this project's keys (October 2026), best first.
// Override with GROQ_MODELS / GEMINI_MODELS (comma-separated) when they change.
const DEFAULT_MODELS = {
  groq: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
  gemini: [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
  ],
};

const MINUTE_MS = 60_000;
// Without a retry hint: 30s, doubling per consecutive 429, capped at 5 min.
const BASE_COOLDOWN_MS = 30_000;
const MAX_DEFAULT_COOLDOWN_MS = 5 * MINUTE_MS;
const MAX_COOLDOWN_MS = 24 * 60 * MINUTE_MS;
// A model the provider says is gone is retried after this long.
const UNAVAILABLE_MODEL_MS = 6 * 60 * MINUTE_MS;
// How long a call may wait for capacity before giving up with a 429.
const INTERACTIVE_MAX_WAIT_MS = 20_000;
const BACKGROUND_MAX_WAIT_MS = 3 * MINUTE_MS;
// Per-minute request slots background calls leave free for readers.
const INTERACTIVE_RPM_RESERVE = 2;

const createSlotState = (model) => ({
  cooldownUntil: 0,
  disabledUntil: 0,
  strikes: 0,
  recentCalls: [], // dispatch times within the last minute
  pendingTokens: 0, // estimated tokens of calls still in flight
  tokens: null, // per-minute token budget, from response headers
  requests: null, // per-day request budget, from response headers
  // Gemini flash-lite models reject the "thinking off" setting (and do not
  // think anyway); other models learn this on their first 400.
  omitThinking: /flash-lite/i.test(model),
  usage: { ok: 0, rateLimited: 0, failed: 0 },
});

let slotState = new Map();
let readersWaiting = 0;

const stateOf = (slot) => {
  if (!slotState.has(slot.key)) slotState.set(slot.key, createSlotState(slot.model));
  return slotState.get(slot.key);
};

/** Forget every cooldown and learned limit. Used by the test suite. */
export const resetAiRateState = () => {
  slotState = new Map();
  readersWaiting = 0;
};

/** Calls per model since the last restart: { "groq:openai/gpt-oss-120b": { ok, rateLimited, failed } }. */
export const getAiUsage = () =>
  Object.fromEntries([...slotState].map(([key, state]) => [key, { ...state.usage }]));

const PROVIDERS = {
  gemini: {
    isConfigured: () => Boolean(env.GEMINI_API_KEY),
    async call({ model, systemPrompt, userPrompt, maxTokens, temperature, omitThinking }) {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
            ...(omitThinking ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
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
    async call({ model, systemPrompt, userPrompt, maxTokens, temperature }) {
      // Reasoning models can spend the whole max_tokens budget thinking and
      // return an empty answer. These structured tasks need little of it.
      const reasoning = /gpt-oss/i.test(model)
        ? { reasoning_effort: "low" }
        : /qwen3/i.test(model)
          ? { reasoning_effort: "none" }
          : {};
      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
          ...reasoning,
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

const parseModelList = (value) =>
  String(value || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

const modelsFor = (provider) => {
  const listed = parseModelList(provider === "groq" ? env.GROQ_MODELS : env.GEMINI_MODELS);
  return listed.length ? listed : DEFAULT_MODELS[provider];
};

/** Every usable slot, preferred provider (AI_PROVIDER) first, then model order. */
const slots = () => {
  const primary = env.AI_PROVIDER.toLowerCase() === "groq" ? "groq" : "gemini";
  const fallback = primary === "groq" ? "gemini" : "groq";
  return [primary, fallback]
    .filter((provider) => PROVIDERS[provider].isConfigured())
    .flatMap((provider) =>
      modelsFor(provider).map((model) => ({ provider, model, key: `${provider}:${model}` })),
    );
};

/** Requests per minute for a slot: an override from env, else the free-tier figure. */
const slotRpm = ({ provider, model }) => {
  const override = Number(provider === "groq" ? env.GROQ_RPM : env.GEMINI_RPM);
  if (override > 0) return override;
  if (provider === "groq") return 30;
  return /flash-lite/i.test(model) ? 15 : 5;
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

const updateBuckets = (slot, headers, now) => {
  const state = stateOf(slot);
  state.tokens = readBucket(headers, "tokens", now) ?? state.tokens;
  state.requests = readBucket(headers, "requests", now) ?? state.requests;
};

/** Rough size of a call as providers count it: prompt (~4 chars/token) plus the output allowance. */
const estimateTokens = (systemPrompt, userPrompt, maxTokens) =>
  Math.ceil((String(systemPrompt).length + String(userPrompt).length) / 4) + maxTokens;

/** Milliseconds until `slot` can take a call of this priority and size (0 = now). */
const slotWaitMs = (slot, priority, estimate, now) => {
  const state = stateOf(slot);
  const reader = priority === "interactive";
  let wait = Math.max(0, state.cooldownUntil - now, state.disabledUntil - now);

  state.recentCalls = state.recentCalls.filter((at) => now - at < MINUTE_MS);
  const rpm = Math.max(1, slotRpm(slot));
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
  const pool = slots();
  if (!pool.length) return { available: false, retryAfterMs: null };
  const now = Date.now();
  const soonest = Math.min(...pool.map((slot) => slotWaitMs(slot, priority, 0, now)));
  const maxWait = priority === "interactive" ? INTERACTIVE_MAX_WAIT_MS : BACKGROUND_MAX_WAIT_MS;
  return { available: soonest <= maxWait, retryAfterMs: soonest };
};

/**
 * Wait for a slot with capacity and reserve it. Throws a 429 straight away
 * when the wait would exceed the priority's limit, rather than sleeping first.
 * Returns null when every slot has already failed this call.
 */
const acquireSlot = async (priority, estimate, excluded) => {
  const reader = priority === "interactive";
  const deadline = Date.now() + (reader ? INTERACTIVE_MAX_WAIT_MS : BACKGROUND_MAX_WAIT_MS);
  if (reader) readersWaiting += 1;
  try {
    for (;;) {
      const candidates = slots().filter((slot) => !excluded.has(slot.key));
      if (!candidates.length) return null;

      const now = Date.now();
      const waits = candidates.map((slot) => slotWaitMs(slot, priority, estimate, now));
      // Background work steps aside while any reader is queued.
      const mustYield = !reader && readersWaiting > 0;
      const ready = mustYield ? -1 : waits.indexOf(0);
      if (ready !== -1) {
        const slot = candidates[ready];
        stateOf(slot).recentCalls.push(now);
        stateOf(slot).pendingTokens += estimate;
        return slot;
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

/** The provider says this model does not exist (any more) for this key. */
const isUnavailableModel = (error) => {
  const status = error?.response?.status;
  const body = error?.response?.data?.error;
  const text = `${body?.code || ""} ${body?.message || ""}`;
  return (
    status === 404 ||
    /model_not_found|model_decommissioned|decommissioned|no longer available|does not exist/i.test(text)
  );
};

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

const markRateLimited = (slot, error, now) => {
  const state = stateOf(slot);
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
  console.warn(`AI model ${slot.key} rate-limited; pausing it for ${Math.round(cooldownMs / 1000)}s`);
};

/**
 * Call one slot. A Gemini model that rejects the "thinking off" setting with a
 * 400 is retried once without it, and remembers that for later calls.
 */
const callSlot = async (slot, args) => {
  const state = stateOf(slot);
  const run = () =>
    PROVIDERS[slot.provider].call({ ...args, model: slot.model, omitThinking: state.omitThinking });
  try {
    return await run();
  } catch (error) {
    const rejectedSetting =
      slot.provider === "gemini" &&
      !state.omitThinking &&
      error?.response?.status === 400 &&
      /invalid argument/i.test(error?.response?.data?.error?.message || "");
    if (!rejectedSetting) throw error;
    state.omitThinking = true;
    return run();
  }
};

/**
 * Generate and parse a structured JSON response.
 *
 * Tries the pool's slots in preference order (see "Model pool" above). Throws
 * an error with statusCode 429 and `retryAfterMs` when no slot can take the
 * call within the wait limit for its priority.
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
  const pool = slots();
  if (!pool.length) {
    throw new Error("No AI provider is configured (set GEMINI_API_KEY or GROQ_API_KEY)");
  }

  const estimate = estimateTokens(systemPrompt, userPrompt, maxTokens);
  // Slots that failed for a reason other than rate limiting are not retried
  // within this call; rate-limited ones may be, after their cooldown.
  const failed = new Set();
  const failures = [];
  let rateLimited = false;
  let content;
  let finishReason;
  let answeredBy;

  for (let attempt = 0; attempt < pool.length + 2 && !answeredBy; attempt += 1) {
    const slot = await acquireSlot(priority, estimate, failed);
    if (!slot) break;
    const state = stateOf(slot);

    try {
      const result = await callSlot(slot, { systemPrompt, userPrompt, maxTokens, temperature });
      updateBuckets(slot, result.headers, Date.now());
      state.strikes = 0;
      state.usage.ok += 1;
      content = result.content;
      finishReason = result.finishReason;
      answeredBy = slot;
    } catch (error) {
      const now = Date.now();
      updateBuckets(slot, error?.response?.headers, now);
      failures.push(`${slot.key}=${error.message}`);
      if (isRateLimitError(error)) {
        rateLimited = true;
        state.usage.rateLimited += 1;
        markRateLimited(slot, error, now);
      } else {
        state.usage.failed += 1;
        failed.add(slot.key);
        if (isUnavailableModel(error)) {
          state.disabledUntil = now + UNAVAILABLE_MODEL_MS;
          console.warn(`AI model ${slot.key} is not available on this key; skipping it for 6h`);
        }
      }
    } finally {
      state.pendingTokens -= estimate;
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
      `AI returned an empty structured response (${answeredBy.key}, finish reason: ${finishReason || "unknown"})`,
    );
  }

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const parsed = parseJsonLenient(fenced ? fenced[1] : content);
  Object.defineProperty(parsed, "__aiMeta", {
    value: { provider: answeredBy.provider, modelUsed: answeredBy.model },
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
