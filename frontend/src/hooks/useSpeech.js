import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Browser text-to-speech for the detailed summary.
 *
 * Uses the Web Speech API directly, so there is no server call and no cost:
 * the speech is synthesised on the reader's own device.
 *
 * The awkward parts of the platform are handled here rather than in the
 * component:
 *
 *  - Chrome truncates an utterance after roughly 15 seconds, so the text is
 *    split into short sentences before it is spoken.
 *  - `getVoices()` returns an empty list until the voice list has loaded, and
 *    Safari does not always fire `voiceschanged`, so the list is polled once.
 *  - The Devanagari danda (।) is a sentence terminator in Hindi, so it has to
 *    be part of the sentence-breaking pattern or Hindi sentences run together.
 */

/** Latin terminators plus the Devanagari danda (U+0964). */
const SENTENCE_BREAK = /(?<=[.!?।])\s+/u;

/** Clause breaks, used to split a sentence that is still too long. */
const CLAUSE_BREAK = /(?<=[,;:،])\s+/u;

/**
 * Maximum characters per spoken chunk.
 *
 * Chrome cuts an utterance off at about 15 seconds. At roughly 150 words per
 * minute that is around 37 words, so 180 characters leaves a safety margin.
 */
export const MAX_CHUNK_LENGTH = 180;

/**
 * Split a fragment on word boundaries so no chunk is left oversized.
 *
 * A clause can still be too long on its own - a list of names with no commas,
 * or a headline pasted in whole - and a single oversized chunk is exactly what
 * Chrome truncates.
 *
 * @param {string} value
 * @param {number} [limit]
 * @returns {string[]}
 */
const splitByWords = (value, limit = MAX_CHUNK_LENGTH) => {
  const words = String(value || "")
    .split(/\s+/)
    .filter(Boolean);
  const parts = [];
  let buffer = "";

  for (const word of words) {
    if (!buffer) {
      buffer = word;
    } else if (`${buffer} ${word}`.length <= limit) {
      buffer = `${buffer} ${word}`;
    } else {
      parts.push(buffer);
      buffer = word;
    }
  }
  if (buffer) parts.push(buffer);
  return parts;
};

/** Preferred locale per language, so an Indian reader gets an Indian voice. */
const PREFERRED_LOCALE = {
  en: "en-IN",
  hi: "hi-IN",
};

/**
 * Split text into paragraphs on blank lines.
 *
 * @param {string} text
 * @returns {string[]}
 */
export const splitIntoParagraphs = (text) =>
  String(text || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

/**
 * Split text into short speakable chunks, remembering which paragraph each
 * chunk came from.
 *
 * @param {string} text
 * @returns {{text: string, paragraphIndex: number}[]}
 */
export const chunkText = (text) => {
  const chunks = [];

  splitIntoParagraphs(text).forEach((paragraph, paragraphIndex) => {
    const sentences = paragraph
      .split(SENTENCE_BREAK)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    for (const sentence of sentences.length ? sentences : [paragraph]) {
      if (sentence.length <= MAX_CHUNK_LENGTH) {
        chunks.push({ text: sentence, paragraphIndex });
        continue;
      }

      // Still too long: break it on clause boundaries and re-pack them into
      // chunks under the limit. A clause with no punctuation of its own falls
      // back to word boundaries, because an oversized chunk is exactly what
      // Chrome truncates.
      const clauses = sentence
        .split(CLAUSE_BREAK)
        .map((clause) => clause.trim())
        .filter(Boolean)
        .flatMap((clause) =>
          clause.length > MAX_CHUNK_LENGTH ? splitByWords(clause) : [clause],
        );

      let buffer = "";
      for (const clause of clauses) {
        if (!buffer) {
          buffer = clause;
        } else if (`${buffer} ${clause}`.length <= MAX_CHUNK_LENGTH) {
          buffer = `${buffer} ${clause}`;
        } else {
          chunks.push({ text: buffer, paragraphIndex });
          buffer = clause;
        }
      }
      if (buffer) chunks.push({ text: buffer, paragraphIndex });
    }
  });

  return chunks;
};

/**
 * Pick the best voice for a language.
 *
 * Order: an exact locale match, then any regional variant of the language,
 * then any voice for the language at all.
 *
 * @param {SpeechSynthesisVoice[]} voices
 * @param {string} lang - "en" or "hi"
 * @returns {SpeechSynthesisVoice|null}
 */
export const selectVoice = (voices, lang = "en") => {
  if (!voices?.length) return null;

  const prefix = String(lang).toLowerCase().split("-")[0];
  const preferred = PREFERRED_LOCALE[prefix] || `${prefix}-IN`;
  const localeOf = (voice) =>
    String(voice?.lang || "").toLowerCase().replace("_", "-");

  return (
    voices.find((voice) => localeOf(voice) === preferred) ||
    voices.find((voice) => localeOf(voice).startsWith(`${prefix}-`)) ||
    voices.find((voice) => localeOf(voice).startsWith(prefix)) ||
    null
  );
};

/**
 * Speak text aloud, with paragraph tracking.
 *
 * @param {Object} options
 * @param {string} options.text - the text to read
 * @param {string} [options.lang] - "en" or "hi", used to pick a voice
 * @param {Function} [options.onParagraphChange] - called with the index of
 *   the paragraph currently being read
 */
export function useSpeech({ text, lang = "en", onParagraphChange } = {}) {
  const supported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  const [voices, setVoices] = useState([]);
  const [voicesResolved, setVoicesResolved] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [activeParagraph, setActiveParagraph] = useState(null);

  const chunksRef = useRef([]);
  const indexRef = useRef(0);
  const speakingRef = useRef(false);
  const voicesRef = useRef([]);
  const langRef = useRef(lang);
  const onParagraphChangeRef = useRef(onParagraphChange);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    onParagraphChangeRef.current = onParagraphChange;
  }, [onParagraphChange]);

  // Load the voice list. It is populated asynchronously, and Safari does not
  // reliably fire `voiceschanged`, so it is also polled once.
  useEffect(() => {
    if (!supported) return undefined;

    const load = () => {
      const list = window.speechSynthesis.getVoices() || [];
      voicesRef.current = list;
      setVoices(list);
      setVoicesResolved(true);
    };

    load();
    const handleChange = () => load();
    window.speechSynthesis.addEventListener?.("voiceschanged", handleChange);
    const poll = window.setTimeout(load, 500);

    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", handleChange);
      window.clearTimeout(poll);
    };
  }, [supported]);

  // Rebuild the chunks whenever the text changes, and stop any speech that
  // is still running - switching language must not leave the old language
  // being read aloud.
  useEffect(() => {
    chunksRef.current = chunkText(text);

    return () => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      speakingRef.current = false;
      indexRef.current = 0;
      setSpeaking(false);
      setPaused(false);
      setActiveParagraph(null);
    };
  }, [text, supported]);

  const voice = useMemo(() => selectVoice(voices, lang), [voices, lang]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    speakingRef.current = false;
    indexRef.current = 0;
    setSpeaking(false);
    setPaused(false);
    setActiveParagraph(null);
  }, [supported]);

  const speakFrom = useCallback(
    (index) => {
      const chunks = chunksRef.current;
      if (!supported || index >= chunks.length) {
        speakingRef.current = false;
        setSpeaking(false);
        setPaused(false);
        setActiveParagraph(null);
        return;
      }

      const chunk = chunks[index];
      indexRef.current = index;

      const utterance = new SpeechSynthesisUtterance(chunk.text);
      const chosen =
        selectVoice(voicesRef.current, langRef.current) ||
        window.speechSynthesis.getDefaultVoice();
      if (chosen) {
        utterance.voice = chosen;
        utterance.lang = chosen.lang;
      } else {
        utterance.lang = PREFERRED_LOCALE[langRef.current] || "en-IN";
      }
      utterance.rate = 1;
      utterance.pitch = 1;

      utterance.onstart = () => {
        setSpeaking(true);
        setActiveParagraph(chunk.paragraphIndex);
        onParagraphChangeRef.current?.(chunk.paragraphIndex);
      };
      utterance.onend = () => {
        if (!speakingRef.current) return;
        speakFrom(index + 1);
      };
      utterance.onerror = (event) => {
        // "interrupted" and "canceled" are what a deliberate stop looks like.
        if (event?.error === "interrupted" || event?.error === "canceled") return;
        stop();
      };

      window.speechSynthesis.speak(utterance);
    },
    [supported, stop],
  );

  const play = useCallback(() => {
    if (!supported || !chunksRef.current.length) return;
    window.speechSynthesis.cancel();
    speakingRef.current = true;
    indexRef.current = 0;
    setPaused(false);
    speakFrom(0);
  }, [supported, speakFrom]);

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }, [supported]);

  return {
    supported,
    voices,
    voicesResolved,
    voice,
    speaking,
    paused,
    activeParagraph,
    play,
    pause,
    resume,
    stop,
  };
}

export default useSpeech;
