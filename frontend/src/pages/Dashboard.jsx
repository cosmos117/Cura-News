import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { newsAPI, bookmarkAPI } from "../services/api";
import SourceLogo from "../components/SourceLogo";
import {
  NEWS_CATEGORIES,
  TOPIC_LABEL_BY_ID,
  NEWS_SOURCES,
  SEARCH_MIN_LENGTH,
  getCategoryClass,
} from "../constants/news";
import { topicIcon } from "../constants/topicIcons";
import { readFeedMode, saveFeedMode } from "../utils/feedMode";
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
  ChevronLeft,
  ExternalLink,
  LayoutGrid,
  LayoutList,
  SlidersHorizontal,
  Sparkles,
  Clock,
  Settings as SettingsIcon,
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
  Bookmark,
} from "lucide-react";

const SEARCH_DEBOUNCE_MS = 300;
const DASHBOARD_STATE_KEY = "curaDashboardState";

const readDashboardState = () => {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_STATE_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw);
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
};

const getSavedPage = (value) => {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
};

const getSavedViewMode = (value) => (value === "cards" ? "cards" : "line");

const saveDashboardState = (state) => {
  try {
    sessionStorage.setItem(DASHBOARD_STATE_KEY, JSON.stringify(state));
  } catch {
    // Session storage may be unavailable in restricted browser contexts.
  }
};

/**
 * Articles fetched per page.
 *
 * The backend paginates server-side (`limit` + `skip`), so the page size is
 * also the largest window the client ever asks for. A day with more articles
 * than this is reachable through the pagination controls instead of being
 * silently truncated.
 */
const PAGE_SIZE = 20;

/**
 * How often the dashboard re-polls for articles.
 *
 * The backend scheduler ingests on its own interval, but an already-open page
 * would otherwise keep showing whatever it loaded on mount - which is exactly
 * how a stale "0 articles" dashboard survives a successful ingest.
 */
const REFRESH_INTERVAL_MS = 60 * 1000;

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
  const stored = localStorage.getItem("curaWeatherCity");
  const defaultCity = CITIES.find((c) => c.name === stored) || CITIES[0];
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem("curaWeatherCity", selectedCity.name);
  }, [selectedCity.name]);

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
  const { user, logout, isAuthenticated, notice, clearNotice } = useAuth();
  const navigate = useNavigate();

  // For You: today's news from the reader's picked papers and topics.
  const preferences = user?.preferences;
  const pickedSources = useMemo(() => preferences?.sources || [], [preferences]);
  const pickedTopics = useMemo(
    () => (preferences?.topics || []).map((id) => TOPIC_LABEL_BY_ID[id]).filter(Boolean),
    [preferences],
  );
  const hasPicks = pickedSources.length > 0 && pickedTopics.length > 0;
  const [feedChoice, setFeedChoice] = useState(readFeedMode);
  // For You is the default once there are picks; a remembered choice wins.
  const forYou = hasPicks && (feedChoice ?? "for-you") === "for-you";
  const savedDashboardState = useRef(readDashboardState());
  const [articles, setArticles] = useState([]);
  const [facets, setFacets] = useState(emptyFacets);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(
    () =>
      typeof savedDashboardState.current.searchInput === "string"
        ? savedDashboardState.current.searchInput
        : "",
  );
  const [searchTerm, setSearchTerm] = useState(
    () =>
      typeof savedDashboardState.current.searchTerm === "string"
        ? savedDashboardState.current.searchTerm
        : "",
  );
  const [selectedCategories, setSelectedCategories] = useState(() => {
    const category =
      new URLSearchParams(window.location.search).get("category") ||
      savedDashboardState.current.selectedCategories?.[0];
    return category ? [category] : [];
  });
  const [selectedSources, setSelectedSources] = useState(
    () => savedDashboardState.current.selectedSources || [],
  );
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState(() =>
    getSavedViewMode(savedDashboardState.current.viewMode),
  );
  const [page, setPage] = useState(() =>
    getSavedPage(savedDashboardState.current.page),
  );
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = useRef(null);
  const lastSearchTermRef = useRef("");
  const resultsRef = useRef(null);
  const pendingScrollPageRef = useRef(null);
  const restoredScrollRef = useRef(false);

  lastSearchTermRef.current = searchTerm;

  useEffect(() => {
    const nextState = {
      searchInput,
      searchTerm,
      selectedCategories,
      selectedSources,
      viewMode,
      page,
      scrollY: savedDashboardState.current.scrollY || 0,
    };
    savedDashboardState.current = nextState;
    saveDashboardState(nextState);
  }, [
    page,
    searchInput,
    searchTerm,
    selectedCategories,
    selectedSources,
    viewMode,
  ]);

  useEffect(() => {
    const rememberScroll = () => {
      const current = readDashboardState();
      const nextState = { ...current, scrollY: window.scrollY };
      savedDashboardState.current = nextState;
      saveDashboardState(nextState);
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => window.removeEventListener("scroll", rememberScroll);
  }, []);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const term = searchInput.trim();
      // The backend rejects terms under SEARCH_MIN_LENGTH, so don't send them.
      const nextTerm = term.length >= SEARCH_MIN_LENGTH ? term : "";
      if (nextTerm === lastSearchTermRef.current) return;
      lastSearchTermRef.current = nextTerm;
      setSearchTerm(nextTerm);
      // A new search re-filters the whole result set, so the old page offset
      // no longer points at the same articles.
      setPage(1);
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
      const params = {
        limit: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      };
      // In For You, a card filter left over from Latest that falls outside the
      // picks is ignored rather than silently emptying the feed.
      const categories = forYou
        ? selectedCategories.filter((category) => pickedTopics.includes(category))
        : selectedCategories;
      const sources = forYou
        ? selectedSources.filter((source) => pickedSources.includes(source))
        : selectedSources;
      if (searchTerm) params.search = searchTerm;
      if (categories.length) params.topic = categories.join(",");
      if (sources.length) params.source = sources.join(",");

      const response = forYou
        ? await newsAPI.getForYou(params)
        : await newsAPI.getAll(params);
      const data = response.data.data || [];
      const pagination = response.data.pagination || {};
      const nextTotal = pagination.total ?? 0;

      // The result set can shrink underneath the reader: the daily cleanup
      // removes articles, and a filter change narrows the set. Landing on an
      // empty page would be a dead end, so step back to the last page that
      // still has content.
      const lastPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
      if (page > lastPage && data.length === 0) {
        setPage(lastPage);
        return;
      }

      setArticles(data);
      setTotal(nextTotal);
      setHasMore(Boolean(pagination.hasMore));
      setFacets({ ...emptyFacets, ...response.data.facets });
      // Only surface errors from a foreground load; a failed background poll
      // should not replace a working list with an error banner.
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) setError(getErrorMessage(err, "Failed to fetch articles"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [searchTerm, selectedCategories, selectedSources, page, forYou, pickedTopics, pickedSources]);

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

  // Move the reader to the top of the results when a new page has loaded, so
  // a fresh page does not start below the tail of the previous one. The wait
  // for `loading` to clear matters: scrolling while the list is still the
  // old one lands the reader in the wrong place once the new page renders.
  useEffect(() => {
    if (pendingScrollPageRef.current === null) return;
    if (loading || articles.length === 0) return;
    pendingScrollPageRef.current = null;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    resultsRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [loading, articles]);

  useEffect(() => {
    if (loading || articles.length === 0 || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    const scrollY = Number(savedDashboardState.current.scrollY) || 0;
    if (scrollY > 0) {
      window.requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
        saveDashboardState({ ...readDashboardState(), scrollY });
      });
    }
  }, [loading, articles]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  /**
   * Change page and remember to scroll once the new articles are in place.
   */
  const goToPage = (nextPage) => {
    pendingScrollPageRef.current = nextPage;
    setPage(nextPage);
  };

  /**
   * Card toggles are multi-select: clicking an active card clears it.
   *
   * Any filter change resets the page, because the filters are applied
   * server-side: page 3 of the previous result set is not page 3 of the new
   * one.
   */
  const makeToggle = (setter) => (value) => {
    setter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
    setPage(1);
  };

  const toggleCategory = makeToggle(setSelectedCategories);
  const toggleSource = makeToggle(setSelectedSources);

  const resetFilters = () => {
    setSearchInput("");
    lastSearchTermRef.current = "";
    setSearchTerm("");
    setSelectedCategories([]);
    setSelectedSources([]);
    setPage(1);
  };

  /**
   * Switch between For You and Latest. Without picks, For You opens the
   * picker instead. The cards on screen differ per feed, so card filters
   * start fresh; the search box is kept.
   */
  const chooseFeed = (mode) => {
    if (mode === "for-you" && !hasPicks) {
      navigate("/welcome");
      return;
    }
    if ((mode === "for-you") === forYou) return;
    saveFeedMode(mode);
    setFeedChoice(mode);
    setSelectedCategories([]);
    setSelectedSources([]);
    setPage(1);
  };

  // In For You only the picked papers and topics get cards.
  const visibleSources = forYou ? NEWS_SOURCES.filter((s) => pickedSources.includes(s)) : NEWS_SOURCES;
  const visibleCategories = forYou
    ? NEWS_CATEGORIES.filter((c) => pickedTopics.includes(c))
    : NEWS_CATEGORIES;

  const activeFilterCount = selectedCategories.length + selectedSources.length;

  const hasFilters = searchTerm !== "" || activeFilterCount > 0;

  // Pagination readouts. `total` is the size of the filtered result set, not
  // the size of the current page, so the range is derived from the offset.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShownOnPage =
    total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + 1, total);
  const lastShownOnPage = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);

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
            <button
              type="button"
              onClick={() => setViewMode("line")}
              aria-pressed={viewMode === "line"}
              title="Line view: one article per row, grouped by source"
              className={`segmented__option${
                viewMode === "line" ? " segmented__option--active" : ""
              }`}
            >
              <LayoutList className="icon icon--sm" />
              <span className="segmented__label">Line</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("cards")}
              aria-pressed={viewMode === "cards"}
              title="Card view: two articles per row"
              className={`segmented__option${
                viewMode === "cards" ? " segmented__option--active" : ""
              }`}
            >
              <LayoutGrid className="icon icon--sm" />
              <span className="segmented__label">Cards</span>
            </button>
          </div>

          <div className="row row-3">
            <button
              onClick={() => navigate("/bookmarks")}
              className="btn btn-secondary btn-sm"
              title="View saved articles"
            >
              <Bookmark className="icon icon--md" />
              <span className="btn__label">Saved</span>
            </button>
            <button
              onClick={() => navigate("/settings")}
              className="icon-btn"
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon className="icon icon--lg" />
            </button>
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
        {notice && (
          <div className="alert alert--info dashboard-notice" role="status">
            <p className="alert-body">{notice}</p>
            <button type="button" className="icon-btn" onClick={clearNotice} aria-label="Dismiss">
              <X className="icon icon--md" />
            </button>
          </div>
        )}

        <section className="feed-switch" aria-label="Choose your feed">
          <div
            className="feed-switch__tabs"
            role="group"
            aria-label="Feed"
            data-active={forYou ? "for-you" : "latest"}
          >
            <span className="feed-switch__indicator" aria-hidden="true" />
            <button
              type="button"
              aria-pressed={forYou}
              onClick={() => chooseFeed("for-you")}
              className={`feed-switch__tab${forYou ? " feed-switch__tab--active" : ""}`}
            >
              <Sparkles className="icon icon--md" />
              For You
            </button>
            <button
              type="button"
              aria-pressed={!forYou}
              onClick={() => chooseFeed("latest")}
              className={`feed-switch__tab${!forYou ? " feed-switch__tab--active" : ""}`}
            >
              <Clock className="icon icon--md" />
              Latest
            </button>
          </div>

          {forYou ? (
            <p className="feed-switch__summary">
              <span>
                Your picks: <strong>{pickedSources.join(", ")}</strong> ·{" "}
                <strong>
                  {pickedTopics.length} {pickedTopics.length === 1 ? "topic" : "topics"}
                </strong>
              </span>
              <button type="button" className="link-quiet" onClick={() => navigate("/welcome")}>
                Edit picks
              </button>
            </p>
          ) : !hasPicks ? (
            <p className="feed-switch__summary">
              <span>Get a feed of just the papers and topics you care about.</span>
              <button type="button" className="link-quiet" onClick={() => navigate("/welcome")}>
                Set up For You
              </button>
            </p>
          ) : (
            <p className="feed-switch__summary">
              <span>Everything from all three papers, newest first.</span>
            </p>
          )}
        </section>

        {/* Source cards */}
        <section aria-label="Browse by source">
          <h2 className="section-title source-section-head__title">
            <Newspaper className="icon icon--md" />
            Sources
          </h2>

          <div className="source-grid">
            {visibleSources.map((source) => {
              const count = facets.bySource[source] || 0;
              const active = selectedSources.includes(source);
              const cardVariant = {
                "The Hindu": "source-card--the-hindu",
                "Indian Express": "source-card--indian-express",
                "Times of India": "source-card--times-of-india",
              }[source] || "";

              return (
                <button
                  key={source}
                  onClick={() => toggleSource(source)}
                  aria-pressed={active}
                  aria-label={`${source}: ${count} ${
                    count === 1 ? "article" : "articles"
                  }`}
                  title={
                    count === 0
                      ? `${source}: no articles match the other filters`
                      : `${source}: ${count} article${count === 1 ? "" : "s"}`
                  }
                  className={`source-card ${cardVariant}${active ? " source-card--active" : ""}`}
                >
                  <SourceLogo source={source} />
                  <span className="source-card__meta">
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
              onClick={() => {
                setSelectedCategories([]);
                setPage(1);
              }}
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

            {visibleCategories.map((category) => {
              const Icon = topicIcon(category);
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
        ) : viewMode === "line" ? (
          <div key={`line-${forYou}`} className="results-anchor feed-results" ref={resultsRef}>
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
        ) : (
          <div key={`cards-${forYou}`} className="results-anchor feed-results" ref={resultsRef}>
            <ArticleGrid className="grid-cards--cards" />
          </div>
        )}

        {!loading && total > 0 && (
          <nav className="pagination" aria-label="Article pagination">
            <button
              type="button"
              className="pagination__btn"
              onClick={() => goToPage(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="icon icon--sm" />
              <span className="pagination__btn-label">Previous</span>
            </button>

            <span className="pagination__status">
              Page {page} of {totalPages}
              <span className="pagination__range">
                Showing {firstShownOnPage}–{lastShownOnPage} of {total}
              </span>
            </span>

            <button
              type="button"
              className="pagination__btn"
              onClick={() => goToPage(page + 1)}
              disabled={!hasMore}
            >
              <span className="pagination__btn-label">Next</span>
              <ChevronRight className="icon icon--sm" />
            </button>
          </nav>
        )}
      </main>
    </div>
  );
}

/**
 * Article card. Renders the actual News schema fields: headline, summary,
 * bulletPoints, category, source, date.
 */
function ArticleCard({ article, onClick }) {
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

      </div>
    </article>
  );
}