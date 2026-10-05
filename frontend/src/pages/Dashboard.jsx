import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { newsAPI } from "../services/api";
import SourceLogo from "../components/SourceLogo";
import {
  NEWS_CATEGORIES,
  TOPIC_LABELS,
  NEWS_SOURCES,
  SEARCH_MIN_LENGTH,
  getCategoryClass,
  getTagClass,
} from "../constants/news";
import {
  formatRelativeTime,
  formatToday,
  getErrorMessage,
} from "../utils/format";
import {
  Newspaper,
  LogOut,
  Search,
  Loader,
  RefreshCw,
  AlertCircle,
  Calendar,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  LayoutList,
  Landmark,
  Briefcase,
  Trophy,
  Cpu,
  Globe2,
  Clapperboard,
  Shapes,
  SlidersHorizontal,
  Check,
  X,
} from "lucide-react";

const SEARCH_DEBOUNCE_MS = 300;

/** Icon per category, for the topic cards. */
const CATEGORY_ICONS = {
  "Politics & Governance": Landmark,
  "Economy & Business": Briefcase,
  Sports: Trophy,
  "Science & Technology": Cpu,
  "World Affairs": Globe2,
  Entertainment: Clapperboard,
  Other: Shapes,
};

const emptyFacets = {
  byCategory: Object.fromEntries(NEWS_CATEGORIES.map((c) => [c, 0])),
  bySource: Object.fromEntries(NEWS_SOURCES.map((s) => [s, 0])),
};

export default function Dashboard() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [facets, setFacets] = useState(emptyFacets);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("grouped");
  const debounceRef = useRef(null);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const term = searchInput.trim();
      // The backend rejects terms under SEARCH_MIN_LENGTH, so don't send them.
      setSearchTerm(term.length >= SEARCH_MIN_LENGTH ? term : "");
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  /**
   * All filters are applied server-side in one request, which is what makes
   * search + category + source + tags combine as an AND. Filtering a
   * client-side page instead silently ignores matches beyond the page limit.
   */
const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 50, skip: 0 };
      if (searchTerm) params.search = searchTerm;
      if (selectedCategories.length) params.category = selectedCategories.join(",");
      if (selectedSources.length) params.source = selectedSources.join(",");

      const response = await newsAPI.getAll(params);
      setArticles(response.data.data || []);
      setTotal(response.data.pagination?.total ?? 0);
      setFacets({ ...emptyFacets, ...response.data.facets });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to fetch articles"));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedCategories, selectedSources]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }
    fetchArticles();
  }, [isAuthenticated, navigate, fetchArticles]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  /** Card toggles are multi-select: clicking an active card clears it. */
  const makeToggle = (setter) => (value) =>
    setter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );

  const toggleCategory = makeToggle(setSelectedCategories);
  const toggleSource = makeToggle(setSelectedSources);

  const resetFilters = () => {
    setSearchInput("");
    setSearchTerm("");
    setSelectedCategories([]);
    setSelectedSources([]);
  };

  const activeFilterCount = selectedCategories.length + selectedSources.length;

  const hasFilters = searchTerm !== "" || activeFilterCount > 0;

  const groupedBySource = useMemo(() => {
    const groups = {};
    for (const article of articles) {
      const source = article.source || "Unknown Source";
      (groups[source] ||= []).push(article);
    }
    return groups;
  }, [articles]);

  const ArticleGrid = ({ items = articles, className = "" }) => (
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

  return (
    <div className="page">
      <header className="site-header">
        <div className="container site-header__inner">
          <div className="brand">
            <div className="brand__mark">
              <Newspaper className="icon icon--lg" />
            </div>
            <div>
              <h1 className="brand__name">CURA News</h1>
              <p className="brand__date">{formatToday()}</p>
            </div>
          </div>

          <div className="segmented" role="group" aria-label="View mode">
            <button
              onClick={() => setViewMode("grouped")}
              aria-pressed={viewMode === "grouped"}
              title="Group by source"
              className={`segmented__option${
                viewMode === "grouped" ? " segmented__option--active" : ""
              }`}
            >
              <LayoutList className="icon icon--md" />
              <span className="segmented__label">By Source</span>
            </button>
            <button
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              title="Grid view"
              className={`segmented__option${
                viewMode === "grid" ? "segmented__option--active" : ""
              }`}
            >
              <LayoutGrid className="icon icon--md" />
              <span className="segmented__label">Grid</span>
            </button>
          </div>

          <div className="row row-3">
            <button
              onClick={fetchArticles}
              disabled={loading}
              className="icon-btn"
              title="Refresh articles"
              aria-label="Refresh articles"
            >
              <RefreshCw
                className={`icon icon--lg${loading ? " spinner spinner--sm" : ""}`}
              />
            </button>

            <div className="user-chip">
              <p className="user-chip__name">{user?.name || "User"}</p>
              <p className="user-chip__email">{user?.email}</p>
            </div>

            <button onClick={handleLogout} className="btn btn-danger btn-sm">
              <LogOut className="icon icon--md" />
              <span className="btn__label">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container page-body stack stack-6">
        {/* Source cards */}
        <section aria-label="Browse by source">
          <h2 className="section-title source-section-head__title">
            <Newspaper className="icon icon--md" />
            Sources
          </h2>

          <div className="source-grid">
            {NEWS_SOURCES.map((source) => {
              const count = facets.bySource[source] || 0;
              const active = selectedSources.includes(source);

              return (
                <button
                  key={source}
                  onClick={() => toggleSource(source)}
                  aria-pressed={active}
                  title={
                    count === 0
                      ? `${source}: no articles match the other filters`
                      : `${source}: ${count} article${count === 1 ? "" : "s"}`
                  }
                  className={`source-card${active ? " source-card--active" : ""}`}
                >
                  <SourceLogo source={source} />
                  <span className="source-card__meta">
                    <span className="source-card__name">{source}</span>
                    <span className="source-card__count">
                      {count} {count === 1 ? "article" : "articles"}
                    </span>
                  </span>
                  {active && (
                    <Check className="source-card__check icon icon--md" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Topic cards */}
        <section aria-label="Browse by category">
          <div className="row row--between topic-section-head">
            <h2 className="section-title topic-section-head__title">
              <SlidersHorizontal className="icon icon--md" />
              Browse topics
            </h2>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="link-quiet">
                Reset all ({activeFilterCount})
              </button>
            )}
          </div>

          <div className="topic-grid">
            <button
              onClick={() => setSelectedCategories([])}
              aria-pressed={selectedCategories.length === 0}
              className={`topic-card topic-card--all${
                selectedCategories.length === 0 ? " topic-card--active" : ""
              }`}
            >
              <span className="topic-card__icon">
                <Newspaper className="icon icon--xl" />
              </span>
              <span className="topic-card__label">All</span>
              <span className="topic-card__count">
                {Object.values(facets.byCategory).reduce((a, b) => a + b, 0)}
              </span>
            </button>

            {NEWS_CATEGORIES.map((category) => {
              const Icon = CATEGORY_ICONS[category] || Shapes;
              const count = facets.byCategory[category] || 0;
              const active = selectedCategories.includes(category);

              return (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
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
                    <Icon className="icon icon--xl" />
                  </span>
                  <span className="topic-card__label">{category}</span>
                  <span className="topic-card__count">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Search. Category and source filtering live in the cards above. */}
        <div className="stack stack-4">
          <div className="search">
            <Search className="search__icon icon icon--lg" />
            <input
              type="text"
              placeholder="Search today's headlines, summaries and points..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input"
              aria-label="Search articles"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                aria-label="Clear search"
                className="field-toggle"
              >
                <X className="icon icon--lg" />
              </button>
            )}
          </div>

          <div className="row row--between row--wrap">
            <p className="text-sm text-muted">
              <strong className="result-count">{total}</strong>{" "}
              {total === 1 ? "article" : "articles"}
              {searchTerm && <span className="active-filter-note"> for “{searchTerm}”</span>}
            </p>
            {hasFilters && (
              <button onClick={resetFilters} className="link-quiet">
                Reset all
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="alert alert--error" role="alert">
            <AlertCircle className="icon icon--lg" />
            <div>
              <p className="alert-title">Error</p>
              <p className="alert-body">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <Loader className="spinner spinner--xl" />
            <p>Loading today's news...</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="empty-state">
            <Newspaper className="empty-state__icon icon--2xl" />
            <p className="empty-state__title">
              {hasFilters ? "No matching articles" : "No news for today"}
            </p>
            <p className="empty-state__hint">
              {hasFilters
                ? "Try removing a filter or widening your search"
                : "Today's news is being prepared. Check back soon."}
            </p>
          </div>
        ) : viewMode === "grouped" ? (
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
        ) : (
          <ArticleGrid />
        )}
      </main>
    </div>
  );
}

/**
 * Article card. Renders the actual News schema fields: headline, summary,
 * bulletPoints, tags, category, source, date.
 */
function ArticleCard({ article, onClick }) {
  const { headline, summary, bulletPoints, tags, category, topic, source, date, url } =
    article;
  const topicLabel = TOPIC_LABELS.find((label) =>
    label.toLowerCase().replaceAll(" & ", "-").replaceAll(" ", "-") === topic,
  ) || category;
  const points = bulletPoints || [];
  const sourceClass = {
    "The Hindu": "article-card--the-hindu",
    "Indian Express": "article-card--indian-express",
    "Times of India": "article-card--times-of-india",
  }[source] || "";

  const handleKeyDown = (e) => {
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
          <span className={`badge ${getCategoryClass(topicLabel)}`}>
            {topicLabel || "Other"}
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
          <span className="article-card__source">{source || "Unknown source"}</span>
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
        </div>

        {tags?.length > 0 && (
          <div className="article-card__tags">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className={`badge badge--sm ${getTagClass(tag)}`}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}