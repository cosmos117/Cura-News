import { Newspaper, SlidersHorizontal } from "lucide-react";
import { NEWS_CATEGORIES, getCategoryClass } from "../../constants/news";
import { topicIcon } from "../../constants/topicIcons";

/**
 * The "All" card plus one toggleable card per topic. A topic with nothing to
 * show under the other filters is disabled unless it is already selected.
 */
export default function TopicCards({
  categories,
  counts,
  selected,
  onToggle,
  onClear,
  activeFilterCount,
  onReset,
}) {
  const allCount = NEWS_CATEGORIES.reduce(
    (totalCount, category) => totalCount + (counts[category] || 0),
    0,
  );

  return (
    <section aria-label="Browse by category">
      <div className="row row--between topic-section-head">
        <h2 className="section-title topic-section-head__title">
          <SlidersHorizontal className="icon icon--md" />
          Browse topics
        </h2>
        {activeFilterCount > 0 && (
          <button onClick={onReset} className="link-quiet">
            Reset all ({activeFilterCount})
          </button>
        )}
      </div>

      <div className="topic-grid">
        <button
          onClick={onClear}
          aria-pressed={selected.length === 0}
          className={`topic-card topic-card--all${
            selected.length === 0 ? " topic-card--active" : ""
          }`}
        >
          <span className="topic-card__icon">
            <Newspaper className="icon icon--sm" />
          </span>
          <span className="topic-card__label">All</span>
          <span className="topic-card__count">{allCount}</span>
        </button>

        {categories.map((category) => {
          const Icon = topicIcon(category);
          const count = counts[category] || 0;
          const active = selected.includes(category);

          return (
            <button
              key={category}
              onClick={() => onToggle(category)}
              aria-pressed={active}
              disabled={count === 0 && !active}
              title={
                count === 0
                  ? `${category}: no articles match the other filters`
                  : `${category}: ${count} article${count === 1 ? "" : "s"}`
              }
              className={`topic-card topic-card--${getCategoryClass(
                category,
              ).replace("cat-", "")}${active ? " topic-card--active" : ""}`}
            >
              <span className="topic-card__icon">
                <Icon className="icon icon--sm" />
              </span>
              <span className="topic-card__label">{category}</span>
              <span className="topic-card__count">{count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
