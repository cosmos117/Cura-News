const ABBREVIATIONS = new Set([
  "a.m.",
  "p.m.",
  "e.g.",
  "i.e.",
  "dr.",
  "mr.",
  "mrs.",
  "ms.",
  "no.",
  "etc.",
]);

const wordCount = (value) => value.split(/\s+/).filter(Boolean).length;

const normalizeSpacing = (value) => {
  let text = value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  text = text.replace(/([)\],;:?!])(?=[A-Za-z])/g, "$1 ");
  return text.replace(/([a-z]{3,}\.)(?=[A-Z])/g, "$1 ");
};

const isProtectedPeriod = (text, index) => {
  const previous = text[index - 1] || "";
  const next = text[index + 1] || "";
  if (/\d/.test(previous) && /\d/.test(next)) return true;

  let start = index;
  while (start > 0 && !/\s/.test(text[start - 1])) start -= 1;
  const token = text.slice(start, index + 1).toLowerCase();
  if (ABBREVIATIONS.has(token)) return true;
  if (/^(?:[a-z]\.){1,}[a-z]?\.?$/i.test(token)) return true;

  const tokenStart = text.slice(start, index + 1);
  if (/[/:@]/.test(tokenStart)) return true;
  if (/[A-Z]\.$/.test(tokenStart) && /[A-Z]\./.test(tokenStart)) return true;
  return false;
};

const splitSentences = (text) => {
  const sentences = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (!".!?".includes(character)) continue;
    if (character === "." && isProtectedPeriod(text, index)) continue;

    let end = index + 1;
    while (end < text.length && /["'»”’)\]]/.test(text[end])) end += 1;
    if (end < text.length && !/\s/.test(text[end])) continue;
    const sentence = text.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
    while (start < text.length && /\s/.test(text[start])) start += 1;
    index = start - 1;
  }

  const remainder = text.slice(start).trim();
  if (remainder) sentences.push(remainder);
  return sentences;
};

const regroup = (sentences, target) => {
  if (sentences.length <= 1) return sentences;
  const paragraphs = [];
  let start = 0;
  for (let paragraph = 0; paragraph < target; paragraph += 1) {
    const remainingSentences = sentences.length - start;
    const remainingParagraphs = target - paragraph;
    const idealWords = sentences
      .slice(start)
      .reduce((total, sentence) => total + wordCount(sentence), 0) / remainingParagraphs;
    let words = 0;
    let end = start;
    while (end < sentences.length - (remainingParagraphs - 1)) {
      const nextWords = words + wordCount(sentences[end]);
      if (end > start && Math.abs(nextWords - idealWords) > Math.abs(words - idealWords)) break;
      words = nextWords;
      end += 1;
    }
    paragraphs.push(sentences.slice(start, end).join(" "));
    start = end;
  }
  if (start < sentences.length) paragraphs[paragraphs.length - 1] += ` ${sentences.slice(start).join(" ")}`;
  return paragraphs.filter(Boolean);
};

export function formatDetailedText(raw, { minParagraphs = 2, maxParagraphs = 3 } = {}) {
  if (typeof raw !== "string") return { valid: false, reason: "empty" };
  const normalized = normalizeSpacing(raw);
  if (!normalized) return { valid: false, reason: "empty" };

  const sentences = splitSentences(normalized);
  const lastCharacter = normalized.at(-1);
  if (!/[.!?]["'»”’)\]]?$/.test(lastCharacter ? normalized : "")) {
    return { valid: false, reason: "truncated" };
  }

  const target = sentences.length >= 6 ? maxParagraphs : minParagraphs;
  const paragraphCount = Math.min(Math.max(target, 1), sentences.length);
  const paragraphs = regroup(sentences, paragraphCount);
  if (paragraphs.length < minParagraphs && sentences.length >= minParagraphs) {
    return { valid: false, reason: "paragraph grouping failed" };
  }
  return { valid: true, text: paragraphs.join("\n\n"), paragraphs };
}

export default formatDetailedText;
