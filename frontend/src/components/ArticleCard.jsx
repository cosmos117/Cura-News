import { useNavigate } from "react-router-dom";
import { Calendar, ChevronRight, ExternalLink } from "lucide-react";
import DetailedBadge from "./DetailedBadge";
import { TOPIC_LABEL_BY_ID, getCategoryClass } from "../constants/news";
import { formatRelativeTime } from "../utils/format";

/** Cards for a list of articles; each opens its article page. */
export function ArticleGrid({ items, className = "" }) {
  const navigate = useNavigate();
  return (
    <div className={`grid-cards ${className}`.trim()}>
      {items.map((article) => (
        <ArticleCard
          key={article._id}
          article={article}
          onClick={() => navigate(`/article/${article._id}`)}
        />
      ))}
    </div>
  );
}

/**
 * Article card. Renders the actual News schema fields: headline, summary,
 * bulletPoints, category, source, date. The whole card opens the article.
 *
 * @param {string} [note] - Extra line after the source, e.g. a bookmark's expiry
 * @param {React.ReactNode} [actions] - Extra footer controls; clicks on them
 *   do not open the card
 */
export default function ArticleCard({ article, onClick, note, actions }) {
  const { headline, summary, bulletPoints, topic, topicLabel, category, source, date, url } =
    article;
  const displayTopicLabel =
    category || topicLabel || TOPIC_LABEL_BY_ID[topic] || "Misc";
  const points = bulletPoints || [];
  const sourceClass = {
    "The Hindu": "article-card--the-hindu",
    "Indian Express": "article-card--indian-express",
    "Times of India": "article-card--times-of-india",
  }[source] || "";

  const handleKeyDown = (e) => {
    // Keys pressed on a link or button inside the card belong to that control.
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <article
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Read article: ${headline}`}
      className={`card card--hover article-card ${sourceClass}`}
    >
      <div className="article-card__body">
        <div className="row row--between row-2 article-card__meta">
          <span className="row row-1 article-card__badges">
            <span className={`badge ${getCategoryClass(displayTopicLabel)}`}>
              {displayTopicLabel}
            </span>
            <DetailedBadge status={article.detailedStatus} />
          </span>
          <span className="row row-1 article-card__time">
            <Calendar className="icon icon--sm" />
            {formatRelativeTime(date)}
          </span>
        </div>

        <h3 className="article-card__title line-clamp-3">{headline}</h3>

        <p className="article-card__summary line-clamp-3">
          {summary || "No summary available"}
        </p>

        {points.length > 0 && (
          <ul className="article-card__points">
            {points.slice(0, 2).map((point, idx) => (
              <li key={idx} className="article-card__point line-clamp-1">
                {point}
              </li>
            ))}
          </ul>
        )}

        <div className="article-card__footer">
          <span className="article-card__source">
            {source || "Unknown source"}
            {note && <span className="article-card__note"> · {note}</span>}
          </span>
          <span className="row row-2">
            {actions && <span onClick={(e) => e.stopPropagation()}>{actions}</span>}
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="article-card__link"
              >
                Read original
                <ExternalLink className="icon icon--sm" />
              </a>
            ) : (
              <ChevronRight className="icon icon--lg article-card__chevron" />
            )}
          </span>
        </div>

      </div>
    </article>
  );
}
