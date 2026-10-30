/**
 * Short summaries without AI.
 *
 * Every article gets a summary and a few key facts from material the publisher
 * already wrote, so the result is free, instant, identical for every reader
 * and cannot invent facts. In order of preference the summary is:
 *
 *   1. the page's own description (og:description and friends): the
 *      standfirst the newsroom wrote for link previews;
 *   2. the RSS description, trimmed to whole sentences;
 *   3. the lead sentences of the article text (news puts the facts first);
 *   4. the headline alone.
 *
 * Candidates 1 and 2 pass a junk filter first: some pages put things like
 * "View this post on Instagram" or a stray quote in those tags.
 *
 * Key facts are the best-scoring other sentences of the article: words that
 * recur across the article mark what it is about, and sentences with figures
 * get a small bonus. Anything repeating the summary or the headline is skipped.
 */

import { splitSentences, wordCount } from "../../utils/formatDetailedText.js";

export const SUMMARY_LIMITS = Object.freeze({
  // News.summary requires at least this many characters.
  minChars: 50,
  // The short summary stays under this, trimmed at a sentence boundary.
  maxWords: 45,
  // Lead sentences are added until the summary reaches this length.
  leadTarget: 25,
  blurbMinWords: 8,
  keyFacts: 3,
  keyFactMinWords: 8,
  keyFactMaxWords: 26,
  sentenceMinWords: 6,
  sentenceMaxWords: 60,
});

// ---------------------------------------------------------------------------
// Text cleaning
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

const fromCodePoint = (code) => {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
};

/** Decode HTML entities such as &quot; &amp; &#8217; &#x2019;. */
export const decodeEntities = (value) =>
  String(value ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === "#") {
      const isHex = body[1].toLowerCase() === "x";
      return fromCodePoint(parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10));
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });

/** Strip tags, decode entities and collapse whitespace. */
export const cleanText = (value) =>
  decodeEntities(String(value ?? "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------------------
// Junk and datelines
// ---------------------------------------------------------------------------

const JUNK_PATTERNS = [
  /\bview this post on\b/i,
  /\bpost shared by\b/i,
  /^(?:also read|read also|read more|click here|subscribe|advertisement|photo credit|file photo|representational image)\b/i,
  /^watch\s*[:|]/i,
  /\b(?:follow|join) (?:us|our)\b/i,
  /\bsubscribe (?:to|now)\b/i,
  /\bsign (?:in|up) (?:to|for|now)\b/i,
  /\ball rights reserved\b/i,
  /©|\bcopyright\b/i,
  /\bnewsletter\b/i,
  /\balready a subscriber\b/i,
  /\bwhatsapp channel\b/i,
];

export const isJunk = (text) => JUNK_PATTERNS.some((pattern) => pattern.test(text));

const AGENCIES = "PTI|IANS|ANI|UNI|Reuters|AP|AFP";
const DATELINES = [
  // "NEW DELHI: ..." or "NEW DELHI (PTI): ..."
  new RegExp(`^[A-Z][A-Z .'-]{2,30}\\s*(?:\\((?:${AGENCIES})\\))?\\s*:\\s+`),
  // "Chennai, Oct 30 (PTI) - ..."
  new RegExp(
    `^[A-Z][A-Za-z .'-]{2,30}(?:,\\s*[A-Za-z]{3,9}\\.?\\s*\\d{1,2})?\\s*\\((?:${AGENCIES})\\)\\s*[:–—-]?\\s*`,
  ),
  // "TOI Correspondent from Washington: ..."
  /^(?:TOI|Express|Staff|Special)\s+(?:Correspondent|Reporter|News Service|Bureau)[^:]{0,40}:\s*/i,
];

/** Remove a leading place/agency dateline, keeping at least some text. */
export const stripDateline = (text) => {
  for (const pattern of DATELINES) {
    const match = text.match(pattern);
    if (match && match[0].length < text.length - 20) return text.slice(match[0].length);
  }
  return text;
};

// ---------------------------------------------------------------------------
// Sentences and similarity
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    "a an the and or but if then than that this those these of to in on at by for with from as is are was " +
    "were be been being it its he she they them his her their we you i not no nor so such into over after " +
    "before about against between during while also said says say will would could should may might can has " +
    "have had do does did there here which who whom whose what when where why how more most other some any " +
    "each both few many much only own same very just"
  ).split(" "),
);

const tokenize = (text) => text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
const contentWords = (text) =>
  tokenize(text).filter((word) => word.length > 2 && !STOPWORDS.has(word));

/** Share of `a`'s content words that also appear in `b` (0-1). */
const similarity = (a, b) => {
  const left = new Set(contentWords(a));
  const right = new Set(contentWords(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / left.size;
};

const LEADING_SYMBOLS = /^[^\p{L}\p{N}"“‘'(\[]+/u;

const TERMINATED = /[.!?]["'”’)\]]*$/;

/** A quotation that opens or closes outside this text is a fragment. */
const hasUnbalancedQuotes = (text) => {
  const opens = (text.match(/“/g) ?? []).length;
  const closes = (text.match(/”/g) ?? []).length;
  const straight = (text.match(/"/g) ?? []).length;
  // A ‘ with no matching ’ later on (apostrophes only ever add closers).
  const singleOpens = (text.match(/‘/g) ?? []).length;
  const singleCloses = (text.match(/’/g) ?? []).length;
  return opens !== closes || straight % 2 === 1 || singleOpens > singleCloses;
};

/** Cut off by the publisher: ends in an ellipsis, or mid-phrase on a function word. */
const looksTruncated = (text) => {
  if (/(?:\.{3}|…)["'”’)]*$/.test(text)) return true;
  if (TERMINATED.test(text)) return false;
  const last = tokenize(text).at(-1);
  return Boolean(last) && STOPWORDS.has(last);
};

const isUsableSentence = (sentence) => {
  const words = wordCount(sentence);
  if (words < SUMMARY_LIMITS.sentenceMinWords || words > SUMMARY_LIMITS.sentenceMaxWords) return false;
  // Headings and captions usually lack a full stop.
  if (!TERMINATED.test(sentence)) return false;
  if (isJunk(sentence) || hasUnbalancedQuotes(sentence)) return false;
  const letters = sentence.match(/\p{L}/gu)?.length ?? 0;
  if (!letters || letters / sentence.length < 0.6) return false;
  const upper = sentence.match(/\p{Lu}/gu)?.length ?? 0;
  if (words > 3 && upper / letters > 0.5) return false;
  // A short quote fragment says nothing on its own.
  if (/^["“‘']/.test(sentence) && words < 10) return false;
  return true;
};

/**
 * Split article text into clean, usable sentences. Newlines mark paragraph
 * boundaries when the caller has them; otherwise the text is one block.
 */
export const prepareSentences = (text) => {
  const sentences = [];
  const seen = new Set();
  for (const line of String(text ?? "").split(/\n+/)) {
    // "...by Reuters.Other firms..." lost its space when the page was flattened.
    const cleaned = stripDateline(cleanText(line)).replace(
      /([a-z]{3,}[.!?]["”’]?)(?=[A-Z])/g,
      "$1 ",
    );
    for (const raw of splitSentences(cleaned)) {
      // Drop leading emoji and bullets such as a check mark.
      const sentence = raw.replace(LEADING_SYMBOLS, "");
      if (!isUsableSentence(sentence)) continue;
      const key = sentence.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      sentences.push(sentence);
    }
  }
  return sentences;
};

const asSentence = (text) =>
  TERMINATED.test(text) ? text : `${text.replace(/[\s,;:–—-]+$/, "")}.`;

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Turn a publisher description into a summary, or null when it is unusable:
 * junk, too short, a quote fragment, or just the headline again. Long ones
 * are cut back to whole sentences.
 */
export const pickBlurb = (candidate, headline) => {
  const text = stripDateline(cleanText(candidate));
  if (!text || isJunk(text)) return null;
  const words = wordCount(text);
  if (words < SUMMARY_LIMITS.blurbMinWords) return null;
  if (/^["“‘']/.test(text) && words < 12) return null;
  if (similarity(text, headline) >= 0.8) return null;

  const picked = [];
  let total = 0;
  for (const sentence of splitSentences(text)) {
    const sentenceWords = wordCount(sentence);
    if (!picked.length && sentenceWords > SUMMARY_LIMITS.sentenceMaxWords) return null;
    if (picked.length && total + sentenceWords > SUMMARY_LIMITS.maxWords) break;
    picked.push(sentence);
    total += sentenceWords;
  }
  let joined = picked.join(" ");
  if (looksTruncated(joined)) {
    // Keep the whole sentences before the cut-off one, if there are any.
    if (picked.length < 2) return null;
    picked.pop();
    joined = picked.join(" ");
  }
  if (hasUnbalancedQuotes(joined)) return null;
  const summary = asSentence(joined);
  return summary.length >= SUMMARY_LIMITS.minChars ? summary : null;
};

const leadSummary = (sentences, headline) => {
  const picked = [];
  let total = 0;
  for (const sentence of sentences.slice(0, 8)) {
    // A lead that only restates the headline adds nothing.
    if (similarity(sentence, headline) >= 0.85) continue;
    const words = wordCount(sentence);
    if (picked.length && total + words > SUMMARY_LIMITS.maxWords) break;
    picked.push(sentence);
    total += words;
    if (total >= SUMMARY_LIMITS.leadTarget) break;
  }
  const text = picked.join(" ");
  return text.length >= SUMMARY_LIMITS.minChars ? { text, sentences: picked } : null;
};

// ---------------------------------------------------------------------------
// Key facts
// ---------------------------------------------------------------------------

const pickKeyFacts = (sentences, { headline, summary, exclude }) => {
  const pool = [];
  sentences.forEach((sentence, index) => {
    const words = wordCount(sentence);
    if (words < SUMMARY_LIMITS.keyFactMinWords || words > SUMMARY_LIMITS.keyFactMaxWords) return;
    if (exclude.has(sentence)) return;
    // Without the story around it, "He said..." or "But..." means nothing.
    if (/^(?:they|he|she|it|this|these|those|that|but|and|however|meanwhile|also)\b/i.test(sentence)) return;
    if (similarity(sentence, summary) >= 0.5 || similarity(sentence, headline) >= 0.7) return;
    pool.push({ sentence, index });
  });
  if (!pool.length) return [];

  // How many sentences each word appears in: recurring words mark the topic.
  const frequency = new Map();
  for (const sentence of sentences) {
    for (const word of new Set(contentWords(sentence))) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  const peak = Math.max(...frequency.values(), 1);

  const scored = pool
    .map(({ sentence, index }) => {
      const words = [...new Set(contentWords(sentence))];
      const topical = words.length
        ? words.reduce((sum, word) => sum + (frequency.get(word) ?? 0) / peak, 0) / words.length
        : 0;
      return { sentence, index, score: topical + (/\d/.test(sentence) ? 0.15 : 0) };
    })
    .sort((a, b) => b.score - a.score);

  const chosen = [];
  for (const candidate of scored) {
    if (chosen.length >= SUMMARY_LIMITS.keyFacts) break;
    if (chosen.some((other) => similarity(candidate.sentence, other.sentence) >= 0.5)) continue;
    chosen.push(candidate);
  }
  // Back into article order, so the facts read in the order the story told them.
  return chosen.sort((a, b) => a.index - b.index).map((entry) => entry.sentence);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the short summary and key facts for one article.
 *
 * @param {Object} input
 * @param {string} input.headline
 * @param {string} input.source - publisher name, used only by the last-resort line
 * @param {string} [input.rssDescription] - description from the RSS item, if any
 * @param {string[]} [input.pageDescriptions] - description tags read from the article page
 * @param {string} [input.pageText] - article body; newlines mark paragraphs
 * @returns {{ summary: string, keyFacts: string[], method: string, sourceWords: number }}
 *   method is "publisher-page", "publisher-rss", "extractive" or "headline".
 */
export function buildShortSummary({
  headline,
  source,
  rssDescription = "",
  pageDescriptions = [],
  pageText = "",
}) {
  const title = cleanText(headline);
  const sentences = prepareSentences(pageText);
  const used = new Set();
  let summary = null;
  let method = null;

  for (const description of pageDescriptions || []) {
    summary = pickBlurb(description, title);
    if (summary) {
      method = "publisher-page";
      break;
    }
  }
  if (!summary) {
    summary = pickBlurb(rssDescription, title);
    if (summary) method = "publisher-rss";
  }
  if (!summary) {
    const lead = leadSummary(sentences, title);
    if (lead) {
      summary = lead.text;
      method = "extractive";
      lead.sentences.forEach((sentence) => used.add(sentence));
    }
  }
  if (!summary) {
    summary = `${title}. Read the original report at ${source}.`;
    method = "headline";
  }

  return {
    summary: summary.slice(0, 1000),
    keyFacts: method === "headline" ? [] : pickKeyFacts(sentences, { headline: title, summary, exclude: used }),
    method,
    sourceWords: wordCount(pageText || rssDescription || title),
  };
}
