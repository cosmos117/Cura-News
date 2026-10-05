import axios from "axios";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import robotsParser from "robots-parser";
import { config } from "../config/env.js";

const USER_AGENT = "CURA-News/1.0 (+https://github.com/cosmos117/Cura-News)";

const unavailable = (reason) => ({
  available: false,
  reason,
  text: "",
  sourceType: "SNIPPET_ONLY",
});

const getRobotsUrl = (articleUrl) => {
  const parsed = new URL(articleUrl);
  return `${parsed.origin}/robots.txt`;
};

export async function extractArticleText(articleUrl) {
  if (!articleUrl || !/^https?:\/\//i.test(articleUrl)) {
    return unavailable("Article URL is missing or invalid");
  }

  let robotsResponse;
  try {
    robotsResponse = await axios.get(getRobotsUrl(articleUrl), {
      timeout: config.FETCH_TIMEOUT_MS,
      headers: { "User-Agent": USER_AGENT },
      validateStatus: (status) => status === 200 || status === 404,
    });
  } catch (error) {
    return unavailable(`Could not verify robots.txt: ${error.message}`);
  }

  if (robotsResponse.status === 200) {
    const robots = robotsParser(getRobotsUrl(articleUrl), robotsResponse.data);
    if (!robots.isAllowed(articleUrl, USER_AGENT)) {
      return unavailable("Article access is disallowed by robots.txt");
    }
  }

  try {
    const response = await axios.get(articleUrl, {
      timeout: config.FETCH_TIMEOUT_MS,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      maxContentLength: 2 * 1024 * 1024,
      responseType: "text",
    });

    const dom = new JSDOM(response.data, { url: articleUrl });
    const parsed = new Readability(dom.window.document).parse();
    const text = parsed?.textContent?.replace(/\s+/g, " ").trim() || "";
    dom.window.close();

    if (text.length < config.MIN_TEXT_CHARS) {
      return unavailable("Article text is too short or paywalled");
    }

    return {
      available: true,
      reason: null,
      text: text.slice(0, config.INPUT_MAX_CHARS),
      sourceType: "FULL_TEXT",
    };
  } catch (error) {
    return unavailable(`Could not extract article text: ${error.message}`);
  }
}
