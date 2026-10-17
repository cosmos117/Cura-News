import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { newsAPI } from "../services/api";
import SourceLogo from "../components/SourceLogo";
import {
  NEWS_CATEGORIES,
  TOPIC_LABEL_BY_ID,
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
  Shield,
  Scale,
  Leaf,
  Heart,
  Users,
  Edit,
  Image,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudFog,
  CloudDrizzle,
  Zap,
  Moon,
  Thermometer,
  Check,
  X,
} from "lucide-react";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * How often the dashboard re-polls for articles.
 *
 * The backend scheduler ingests on its own interval, but an already-open page
 * would otherwise keep showing whatever it loaded on mount - which is exactly
 * how a stale "0 articles" dashboard survives a successful ingest.
 */
const REFRESH_INTERVAL_MS = 60 * 1000;

/** Icon per category, for the topic cards. */
const CATEGORY_ICONS = {
  "Politics & Governance": Landmark,
  "Opinion & Editorial": Edit,
  "Economy & Business": Briefcase,
  "Agriculture & Rural": Shapes,
  "World Affairs": Globe2,
  "Defence & Security": Shield,
  "Law & Judiciary": Scale,
  "Science & Technology": Cpu,
  "Environment & Climate": Leaf,
  "Health": Heart,
  "Education & Society": Users,
  "Culture & Lifestyle": Image,
  Sports: Trophy,
  Entertainment: Clapperboard,
  Other: Shapes,
};

/** Indian cities offered in the header weather dropdown. */
const CITIES = [
  { name: "Delhi", lat: 28.61, lon: 77.21 },
  { name: "Mumbai", lat: 19.08, lon: 72.88 },
  { name: "Bengaluru", lat: 12.97, lon: 77.59 },
  { name: "Hyderabad", lat: 17.38, lon: 78.48 },
  { name: "Chennai", lat: 13.08, lon: 80.27 },
  { name: "Kolkata", lat: 22.57, lon: 88.36 },
  { name: "Ahmedabad", lat: 23.02, lon: 72.57 },
  { name: "Pune", lat: 18.52, lon: 73.86 },
  { name: "Jaipur", lat: 26.91, lon: 75.79 },
  { name: "Lucknow", lat: 26.85, lon: 80.95 },
  { name: "Surat", lat: 21.17, lon: 72.83 },
  { name: "Nagpur", lat: 21.15, lon: 79.09 },
  { name: "Patna", lat: 25.59, lon: 85.14 },
  { name: "Bhopal", lat: 23.26, lon: 77.41 },
  { name: "Chandigarh", lat: 30.73, lon: 76.78 },
];

/** Open-Meteo weather-code -> (label, icon). No API key required. */
const WEATHER_CODES = {
  0: { label: "Clear", Icon: Sun },
  1: { label: "Mainly clear", Icon: Cloud },
  2: { label: "Partly cloudy", Icon: Cloud },
  3: { label: "Overcast", Icon: Cloud },
  45: { label: "Fog", Icon: CloudFog },
  48: { label: "Depositing rime fog", Icon: CloudFog },
  51: { label: "Light drizzle", Icon: CloudDrizzle },
  53: { label: "Drizzle", Icon: CloudDrizzle },
  55: { label: "Heavy drizzle", Icon: CloudDrizzle },
  56: { label: "Light freezing drizzle", Icon: CloudDrizzle },
  57: { label: "Freezing drizzle", Icon: CloudDrizzle },
  61: { label: "Slight rain", Icon: CloudRain },
  63: { label: "Rain", Icon: CloudRain },
  65: { label: "Heavy rain", Icon: CloudRain },
  66: { label: "Light freezing rain", Icon: CloudRain },
  67: { label: "Freezing rain", Icon: CloudRain },
  71: { label: "Slight snow", Icon: CloudSnow },
  73: { label: "Snow", Icon: CloudSnow },
  75: { label: "Heavy snow", Icon: CloudSnow },
  77: { label: "Snow grains", Icon: CloudSnow },
  80: { label: "Rain showers", Icon: CloudRain },
  81: { label: "Rain showers", Icon: CloudRain },
  82: { label: "Heavy rain showers", Icon: CloudRain },
  85: { label: "Snow showers", Icon: CloudSnow },
  86: { label: "Heavy snow showers", Icon: CloudSnow },
  95: { label: "Thunderstorm", Icon: Zap },
  96: { label: "Thunderstorm with hail", Icon: Zap },
  99: { label: "Thunderstorm with heavy hail", Icon: Zap },
};

/**
 * Header weather widget powered by Open-Meteo.
 * Lets the user pick an Indian city and shows its current condition.
 * No API key required.
 */
function WeatherWidget() {
  const [selectedCity, setSelectedCity] = useState(CITIES[0]);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchWeather = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", String(selectedCity.lat));
        url.searchParams.set("longitude", String(selectedCity.lon));
        url.searchParams.set("current_weather", "true");
        url.searchParams.set("temperature_unit", "celsius");

        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) throw new Error("Weather service unavailable");
        const data = await res.json();
        if (cancelled) return;
        setWeather({
          temperature: Math.round(data.current_weather?.temperature ?? 0),
          weathercode: data.current_weather?.weathercode ?? 0,
          time: data.current_weather?.time ?? "",
        });
        setError(null);
      } catch (err) {
        if (cancelled || err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load weather");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWeather();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedCity]);

  const entry = weather ? WEATHER_CODES[weather.weathercode] : null;
  const Icon = entry?.Icon || Cloud;

  if (error) {
    return (
      <div className="weather-widget weather-widget--error" title={error}>
        <Thermometer className="icon icon--sm" /> Weather unavailable
      </div>
    );
  }

  return (
    <div className="weather-widget" aria-label={`Weather in ${selectedCity.name}`}>
      <select
        value={selectedCity.name}
        onChange={(e) => {
          const picked = CITIES.find((c) => c.name === e.target.value);
          setSelectedCity(picked || selectedCity);
        }}
        className="weather-widget__city"
        aria-label="Select city"
      >
        {CITIES.map((city) => (
          <option key={city.name} value={city.name}>{city.name}</option>
        ))}
      </select>
      <div className="weather-widget__temp">
        {loading ? (
          <Thermometer className="icon icon--sm animate-pulse" /> 
        ) : (
          <>
            {weather?.temperature}°C
          </>
        )}
      </div>
      <div className="weather-widget__condition">
        {loading ? (
          <span>Loading…</span>
        ) : (
          <>
            <Icon className="icon icon--sm" /> {entry?.label ?? "—"}
          </>
        )}
      </div>
    </div>
  );
}

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
  const [selectedCategories, setSelectedCategories] = useState(() => {
    const category = new URLSearchParams(window.location.search).get("category");
    return category ? [category] : [];
  });
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
const fetchArticles = useCallback(async ({ silent = false } = {}) => {
    // A silent refresh (the periodic poll) leaves existing content on screen.
    // Clearing `loading` here would blank the whole dashboard every minute and
    // make it look like the data was being lost and re-fetched.
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const params = { limit: 50, skip: 0 };
      if (searchTerm) params.search = searchTerm;
      if (selectedCategories.length) params.topic = selectedCategories.join(",");
      if (selectedSources.length) params.source = selectedSources.join(",");

      const response = await newsAPI.getAll(params);
      setArticles(response.data.data || []);
      setTotal(response.data.pagination?.total ?? 0);
      setFacets({ ...emptyFacets, ...response.data.facets });
      // Only surface errors from a foreground load; a failed background poll
      // should not replace a working list with an error banner.
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) setError(getErrorMessage(err, "Failed to fetch articles"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [searchTerm, selectedCategories, selectedSources]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }
    fetchArticles();
  }, [isAuthenticated, navigate, fetchArticles]);

  // Periodically re-poll so articles ingested by the backend scheduler appear
  // without a manual reload. Paused while the tab is hidden: a background tab
  // polling every minute is pure waste, and this also means returning to the tab
  // always triggers an immediate catch-up refresh.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let refreshTimer = null;

    const poll = () => {
      fetchArticles({ silent: true });
      refreshTimer = setTimeout(poll, REFRESH_INTERVAL_MS);
    };

    // Only schedules the next poll. The initial load is already handled by the
    // effect above, so polling here must not fire an immediate duplicate
    // request on mount.
    const startPolling = () => {
      if (refreshTimer === null) {
        refreshTimer = setTimeout(poll, REFRESH_INTERVAL_MS);
      }
    };

    const stopPolling = () => {
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Catch up immediately after the tab becomes visible again.
        fetchArticles({ silent: true });
        startPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    if (!document.hidden) startPolling();

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAuthenticated, fetchArticles]);

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
          <div className="header__left">
            <WeatherWidget />

            <div className="brand">
              <div className="brand__mark">
                <img src="/logo.svg" alt="" width="40" height="40" />
              </div>
              <div>
                <h1 className="brand__name">CURA News</h1>
                <p className="brand__date">{formatToday()}</p>
              </div>
            </div>
          </div>

          <div className="segmented" role="group" aria-label="View mode">
            
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
                {NEWS_CATEGORIES.reduce(
                  (totalCount, category) => totalCount + (facets.byCategory[category] || 0),
                  0,
                )}
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
  const { headline, summary, bulletPoints, tags, topic, topicLabel, source, date, url } =
    article;
  const displayTopicLabel = topicLabel || TOPIC_LABEL_BY_ID[topic] || "Other";
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
          <span className={`badge ${getCategoryClass(displayTopicLabel)}`}>
            {displayTopicLabel}
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