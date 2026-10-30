import { Play, Pause, Square, Volume2 } from "lucide-react";
import { useSpeech } from "../hooks/useSpeech";

/**
 * Read the detailed summary aloud.
 *
 * The speech is synthesised in the browser, so there is no server call and no
 * cost. The paragraph being read is highlighted through `onParagraphChange`.
 *
 * The button is only rendered once the device's voice list is known. A device
 * with no speech voices at all cannot read anything, so the control is hidden
 * rather than shown broken.
 */
export default function ListenButton({
  text,
  lang = "en",
  disabled = false,
  onParagraphChange,
}) {
  const {
    supported,
    voicesResolved,
    voices,
    voice,
    speaking,
    paused,
    play,
    pause,
    resume,
    stop,
  } = useSpeech({ text, lang, onParagraphChange });

  if (!supported || !voicesResolved || voices.length === 0) return null;

  // The device has voices, but none for this language. The default voice can
  // still read the text, so the control stays available with a note.
  const missingLanguageVoice = !voice;
  const languageName = lang === "hi" ? "Hindi" : "English";

  const handleClick = () => {
    if (!speaking) {
      play();
      return;
    }
    if (paused) {
      resume();
      return;
    }
    pause();
  };

  const label = !speaking ? "Listen" : paused ? "Resume" : "Pause";

  return (
    <div className="listen-control">
      <div className="row row-2">
        <button
          type="button"
          className={`listen-btn${speaking && !paused ? " listen-btn--active" : ""}`}
          onClick={handleClick}
          disabled={disabled}
          aria-pressed={speaking}
          title={`${label} - read this summary aloud`}
        >
          {!speaking ? (
            <Volume2 className="icon icon--md" />
          ) : paused ? (
            <Play className="icon icon--md" />
          ) : (
            <Pause className="icon icon--md" />
          )}
          {label}
        </button>

        {speaking && (
          <button
            type="button"
            className="listen-btn"
            onClick={stop}
            title="Stop reading"
            aria-label="Stop reading"
          >
            <Square className="icon icon--md" />
          </button>
        )}
      </div>

      {missingLanguageVoice && (
        <p className="listen-note">
          No {languageName} voice is installed on this device - the default
          voice will read it.
        </p>
      )}

      <span className="visually-hidden" aria-live="polite">
        {speaking ? `Reading aloud${paused ? ", paused" : ""}.` : ""}
      </span>
    </div>
  );
}
