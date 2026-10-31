/**
 * The 15 category labels shown on topic cards. Each is the label of one topic
 * in config/topics.js; an article's category is always its topic's label.
 */
import { TOPICS } from "../config/topics.js";

export const NEWS_CATEGORIES = TOPICS.map((topic) => topic.label);

export const DEFAULT_CATEGORY = "Misc";
