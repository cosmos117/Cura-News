import axios from "axios";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import robotsParser from "robots-parser";
import { config } from "../config/env.js";
import { assertPublicRedirect, isPublicHttpUrl, publicOnlyAgents } from "../utils/safeFetch.js";

const USER_AGENT = "CURA-News/1.0 (+https://github.com/cosmos117/Cura-News)";

// robots.txt is read once per site and reused, instead of once per article:
// ingest fetches hundreds of pages from the same three sites.
const ROBOTS_TTL_MS = 60 * 60 * 1000;
const ROBOTS_FAILURE_TTL_MS = 5 * 60 * 1000;
const robotsCache = new Map();

/** Forget cached robots.txt files. Used by the test suite. */
export const resetRobotsCache = () => robotsCache.clear();

const unavailable = (reason, extra = {}) => ({
  available: false,
  reason,
  text: "",
  sourceType: "SNIPPET_ONLY",
  descriptions: [],
  paragraphs: [],
  ...extra,
});

const getRobotsUrl = (articleUrl) => {
  const parsed = new URL(articleUrl);
  return `${parsed.origin}/robots.txt`;
};

/**
 * The site's parsed robots.txt, or null when there is none or it could not be
 * read (a missing or unreadable file does not forbid anything).
 */
const loadRobots = async (articleUrl) => {
  const robotsUrl = getRobotsUrl(articleUrl);
  const cached = robotsCache.get(robotsUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.robots;

  let robots = null;
  let ttl = ROBOTS_TTL_MS;
  try {
    const response = await axios.get(robotsUrl, {
      timeout: config.FETCH_TIMEOUT_MS,
      headers: { "User-Agent": USER_AGENT },
      maxContentLength: 512 * 1024,
      maxRedirects: 3,
      beforeRedirect: assertPublicRedirect,
      ...publicOnlyAgents,
      validateStatus: (status) => status === 200 || status === 403 || status === 404,
    });
    if (response?.status === 200) robots = robotsParser(robotsUrl, response.data);
  } catch {
    ttl = ROBOTS_FAILURE_TTL_MS;
  }
  robotsCache.set(robotsUrl, { robots, expiresAt: Date.now() + ttl });
  return robots;
};

const removePageNoise = (document) => {
  const selectors = [
    "script",
    "style",
    "noscript",
    "template",
    "nav",
    "footer",
    "aside",
    "form",
    "figcaption",
    "[class*='advert']",
    "[id*='advert']",
    "[class*='related']",
    "[id*='related']",
    "[class*='popular']",
    "[id*='popular']",
    "[class*='caption']",
    "[class*='credit']",
    "[class*='social']",
    "[class*='newsletter']",
    "[class*='subscription']",
  ];

  document.querySelectorAll(selectors.join(",")).forEach((element) => {
    element.remove();
  });
};

/**
 * The page's own description tags, best first. Publishers write these as the
 * standfirst shown in link previews. Must be read before Readability runs,
 * which rewrites the document.
 */
const readDescriptions = (document) => {
  const selectors = [
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
    'meta[name="description"]',
  ];
  const found = [];
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (value && !found.includes(value)) found.push(value);
  }
  return found;
};

/**
 * Fetch an article page and extract its readable text.
 *
 * @param {string} articleUrl
 * @param {Object} [options]
 * @param {number} [options.minChars] - shorter text counts as too short or
 *   paywalled (default MIN_TEXT_CHARS, which suits detailed summaries)
 * @param {boolean} [options.paragraphs] - also return the body's <p> paragraphs
 * @returns {Promise<Object>} { available, reason, text, sourceType,
 *   descriptions, paragraphs }. `descriptions` is filled whenever the page was
 *   read, even when the text was too short. `failed` is true when the page
 *   could not be fetched at all (as opposed to being thin or disallowed).
 */
export async function extractArticleText(
  articleUrl,
  { minChars = config.MIN_TEXT_CHARS, paragraphs = false } = {},
) {
  try {
    // Public web pages only: never localhost, a private network or the
    // host's metadata service (see utils/safeFetch.js).
    if (!articleUrl || !isPublicHttpUrl(articleUrl)) {
      return unavailable("Article URL is missing or invalid");
    }

    const robots = await loadRobots(articleUrl);
    if (robots && !robots.isAllowed(articleUrl, USER_AGENT)) {
      return unavailable("Article access is disallowed by robots.txt");
    }

    const response = await axios.get(articleUrl, {
      timeout: config.FETCH_TIMEOUT_MS,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      maxContentLength: 2 * 1024 * 1024,
      maxRedirects: 3,
      beforeRedirect: assertPublicRedirect,
      ...publicOnlyAgents,
      responseType: "text",
    });

    const dom = new JSDOM(response.data, { url: articleUrl });
    const descriptions = readDescriptions(dom.window.document);
    removePageNoise(dom.window.document);
    const parsed = new Readability(dom.window.document).parse();
    const text = parsed?.textContent
      ?.replace(/\b(?:Getty\s*Images?|Istock|Shutterstock)\s*[/|:-].*?(?=[A-Z][a-z])/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "";

    let paragraphList = [];
    if (paragraphs && parsed?.content) {
      const holder = dom.window.document.createElement("div");
      holder.innerHTML = parsed.content;
      paragraphList = [...holder.querySelectorAll("p")]
        .map((paragraph) => paragraph.textContent.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    }
    dom.window.close();

    if (text.length < minChars) {
      return unavailable("Article text is too short or paywalled", { descriptions });
    }

    return {
      available: true,
      reason: null,
      text: text.slice(0, config.INPUT_MAX_CHARS),
      sourceType: "FULL_TEXT",
      descriptions,
      paragraphs: paragraphList,
    };
  } catch (error) {
    console.warn(`Article fetch failed for ${articleUrl}: ${error.message}`);
    return unavailable("Could not read the article page", { failed: true });
  }
}
