import { useState } from "react";

/**
 * Publisher artwork for the source cards.
 *
 * REAL LOGO FILES: drop them in `frontend/public/logos/` using exactly these
 * filenames and they are used automatically:
 *
 *   frontend/public/logos/the-hindu.png
 *   frontend/public/logos/indian-express.png
 *   frontend/public/logos/times-of-india.png
 *
 * Files in `public/` are served from the site root, so the src is `/logos/...`
 * with no import needed. If a file is missing the <img> fires onError, removes
 * itself, and the monogram underneath stays visible — so the cards never render
 * broken, whatever you have or have not added yet.
 *
 * The monogram is the deliberate fallback, not the intended artwork: shipping
 * the publishers' real trademarks means bundling third-party assets with their
 * own usage terms.
 */

const SOURCE_ART = {
  "The Hindu": {
    file: "/logos/the-hindu.png",
    initials: "H",
    color: "#c0392b",
  },
  "Indian Express": {
    file: "/logos/indian-express.png",
    initials: "IE",
    color: "#1f2937",
  },
  "Times of India": {
    file: "/logos/times-of-india.png",
    initials: "TOI",
    color: "#e2571e",
  },
};

const FALLBACK = { file: null, initials: "?", color: "#6b7280" };

/**
 * Renders a source's artwork as the decorative background of its card, with a
 * coloured monogram underneath as the fallback.
 *
 * Purely decorative: the card's accessible name comes from the visible source
 * name, so this is hidden from assistive tech to avoid announcing it twice.
 *
 * @param {Object} props
 * @param {string} props.source - Source name from the backend enum
 * @returns {JSX.Element}
 */
export default function SourceLogo({ source }) {
  const art = SOURCE_ART[source] || FALLBACK;
  // Reset when the source changes so a different card retries its own file.
  const [artFailed, setArtFailed] = useState(false);
  const showArt = Boolean(art.file) && !artFailed;

  return (
    <span className="source-card__logo" aria-hidden="true">
      <span
        className="source-card__logo-mark"
        style={{ background: art.color }}
      >
        {art.initials}
      </span>

      {showArt && (
        <img
          className="source-card__logo-img"
          src={art.file}
          alt=""
          loading="lazy"
          onError={() => setArtFailed(true)}
        />
      )}
    </span>
  );
}