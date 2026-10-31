import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader, Newspaper, Sparkles } from "lucide-react";
import { ArticleGrid } from "../ArticleCard";

const groupBySource = (articles) => {
  const groups = {};
  for (const article of articles) {
    const source = article.source || "Unknown Source";
    (groups[source] ||= []).push(article);
  }
  return groups;
};

function EmptyFeed({ hasFilters, forYou }) {
  const navigate = useNavigate();
  return (
    <div className="empty-state">
      <Newspaper className="empty-state__icon icon--2xl" />
      <p className="empty-state__title">
        {hasFilters
          ? "No matching articles"
          : forYou
            ? "Nothing from your picks yet today"
            : "No news for today"}
      </p>
      <p className="empty-state__hint">
        {hasFilters
          ? "Try removing a filter or widening your search"
          : forYou
            ? "New stories arrive through the day. Adding a few topics fills your feed faster."
            : "Today's news is being prepared. Check back soon."}
      </p>
      {forYou && !hasFilters && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate("/welcome")}>
          <Sparkles className="icon icon--md" />
          Edit picks
        </button>
      )}
    </div>
  );
}

/**
 * The article list: a spinner while loading, an empty state, or the articles
 * in line view (grouped by paper) or card view. The ref marks the top of the
 * list, for scrolling there after a page change.
 */
const FeedResults = forwardRef(function FeedResults(
  { articles, loading, viewMode, forYou, hasFilters },
  ref,
) {
  const groupedBySource = useMemo(() => groupBySource(articles), [articles]);

  if (loading) {
    return (
      <div className="loading-state">
        <Loader className="spinner spinner--xl" />
        <p>Loading today's news...</p>
      </div>
    );
  }

  if (articles.length === 0) {
    return <EmptyFeed hasFilters={hasFilters} forYou={forYou} />;
  }

  if (viewMode === "cards") {
    return (
      <div key={`cards-${forYou}`} className="results-anchor feed-results" ref={ref}>
        <ArticleGrid items={articles} className="grid-cards--cards" />
      </div>
    );
  }

  return (
    <div key={`line-${forYou}`} className="results-anchor feed-results" ref={ref}>
      <div className="stack stack-8">
        {Object.entries(groupedBySource).map(([source, sourceArticles]) => (
          <section key={source}>
            <div className="source-heading">
              <div className="source-heading__rule" />
              <h2 className="source-heading__name">{source}</h2>
              <span className="spacer" />
              <span className="source-heading__count">
                {sourceArticles.length}{" "}
                {sourceArticles.length === 1 ? "article" : "articles"}
              </span>
            </div>
            <ArticleGrid items={sourceArticles} />
          </section>
        ))}
      </div>
    </div>
  );
});

export default FeedResults;
