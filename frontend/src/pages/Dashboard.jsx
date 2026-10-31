import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Search, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { newsAPI } from "../services/api";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import FeedSwitch from "../components/dashboard/FeedSwitch";
import SourceCards from "../components/dashboard/SourceCards";
import TopicCards from "../components/dashboard/TopicCards";
import FeedResults from "../components/dashboard/FeedResults";
import Pagination from "../components/dashboard/Pagination";
import useFeedPolling from "../hooks/useFeedPolling";
import {
  NEWS_CATEGORIES,
  TOPIC_LABEL_BY_ID,
  NEWS_SOURCES,
  SEARCH_MIN_LENGTH,
} from "../constants/news";
import { readFeedMode, saveFeedMode } from "../utils/feedMode";
import {
  getSavedPage,
  getSavedString,
  getSavedViewMode,
  readDashboardState,
  saveDashboardState,
} from "../utils/dashboardState";
import { getErrorMessage } from "../utils/format";

const SEARCH_DEBOUNCE_MS = 300;

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
  const [searchInput, setSearchInput] = useState(() =>
    getSavedString(savedDashboardState.current.searchInput),
  );
  const [searchTerm, setSearchTerm] = useState(() =>
    getSavedString(savedDashboardState.current.searchTerm),
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

  // Re-poll so articles ingested by the backend scheduler appear without a
  // manual reload. A silent refresh leaves the current list on screen.
  const refreshSilently = useCallback(() => fetchArticles({ silent: true }), [fetchArticles]);
  useFeedPolling(refreshSilently, REFRESH_INTERVAL_MS, isAuthenticated);

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

  const clearCategories = () => {
    setSelectedCategories([]);
    setPage(1);
  };

  return (
    <div className="page">
      <DashboardHeader
        user={user}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRefresh={() => fetchArticles()}
        refreshing={loading}
        onLogout={handleLogout}
      />

      <main className="container page-body stack stack-6">
        {notice && (
          <div className="alert alert--info dashboard-notice" role="status">
            <p className="alert-body">{notice}</p>
            <button type="button" className="icon-btn" onClick={clearNotice} aria-label="Dismiss">
              <X className="icon icon--md" />
            </button>
          </div>
        )}

        <FeedSwitch
          forYou={forYou}
          hasPicks={hasPicks}
          pickedSources={pickedSources}
          pickedTopics={pickedTopics}
          onChoose={chooseFeed}
        />

        <SourceCards
          sources={visibleSources}
          counts={facets.bySource}
          selected={selectedSources}
          onToggle={toggleSource}
        />

        <TopicCards
          categories={visibleCategories}
          counts={facets.byCategory}
          selected={selectedCategories}
          onToggle={toggleCategory}
          onClear={clearCategories}
          activeFilterCount={activeFilterCount}
          onReset={resetFilters}
        />

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

        <FeedResults
          ref={resultsRef}
          articles={articles}
          loading={loading}
          viewMode={viewMode}
          forYou={forYou}
          hasFilters={hasFilters}
        />

        {!loading && total > 0 && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            hasMore={hasMore}
            onPageChange={goToPage}
          />
        )}
      </main>
    </div>
  );
}
