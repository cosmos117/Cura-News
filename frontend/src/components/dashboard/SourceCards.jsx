import { Check, Newspaper } from "lucide-react";
import SourceLogo from "../SourceLogo";

const CARD_VARIANTS = {
  "The Hindu": "source-card--the-hindu",
  "Indian Express": "source-card--indian-express",
  "Times of India": "source-card--times-of-india",
};

const articlesLabel = (count) => `${count} ${count === 1 ? "article" : "articles"}`;

/** One toggleable card per paper, showing how many articles it would yield. */
export default function SourceCards({ sources, counts, selected, onToggle }) {
  return (
    <section aria-label="Browse by source">
      <h2 className="section-title source-section-head__title">
        <Newspaper className="icon icon--md" />
        Sources
      </h2>

      <div className="source-grid">
        {sources.map((source) => {
          const count = counts[source] || 0;
          const active = selected.includes(source);

          return (
            <button
              key={source}
              onClick={() => onToggle(source)}
              aria-pressed={active}
              aria-label={`${source}: ${articlesLabel(count)}`}
              title={
                count === 0
                  ? `${source}: no articles match the other filters`
                  : `${source}: ${count} article${count === 1 ? "" : "s"}`
              }
              className={`source-card ${CARD_VARIANTS[source] || ""}${active ? " source-card--active" : ""}`}
            >
              <SourceLogo source={source} />
              <span className="source-card__meta">
                <span className="source-card__count">{articlesLabel(count)}</span>
              </span>
              {active && <Check className="source-card__check icon icon--md" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
