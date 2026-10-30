import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { bookmarkAPI, newsAPI } from "../services/api";
import { getCategoryClass } from "../constants/news";
import { TOPIC_LABELS } from "../constants/news";
import { formatDate, formatExpiry, getErrorMessage } from "../utils/format";
import ListenButton from "../components/ListenButton";
import {
  ArrowLeft,
  Loader,
  AlertCircle,
  Sparkles,
  Clock,
  Newspaper,
  FileText,
  ExternalLink,
  Bookmark,
  Share2,
} from "lucide-react";

const TABS = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "detailed", label: "Detailed", icon: Sparkles },
];

/** Detailed-summary states that need no further requests. */
const DETAILED_SETTLED = new Set(["DONE", "FAILED", "UNAVAILABLE"]);
// A rate-limited request is retried automatically when the server expects
// capacity back within this long; longer waits are reported instead.
const AUTO_RETRY_MAX_WAIT_MS = 60 * 1000;
const MAX_AUTO_RETRIES = 3;

/** "in about 5 minutes" / "in about 18 hours" */
const describeWait = (ms) => {
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
};

export default function Article() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("article");
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [generatingDetailed, setGeneratingDetailed] = useState(false);
  // Neutral status for the Detailed tab, e.g. waiting out an AI rate limit.
  const [detailedNotice, setDetailedNotice] = useState(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  // The paragraph currently being read aloud, so it can be highlighted.
  const [activeParagraph, setActiveParagraph] = useState(null);

  const fetchArticle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await newsAPI.getById(id);
      setArticle(response.data.data);
      try {
        const bookmarkResponse = await bookmarkAPI.getStatus(id);
        setBookmarked(Boolean(bookmarkResponse.data.data?.bookmarked));
      } catch (bookmarkError) {
        setBookmarked(false);
        setActionError(
          getErrorMessage(bookmarkError, "Saved state is temporarily unavailable"),
        );
      }
      setLoading(false);
    } catch (err) {
      // Articles are deleted nightly; a saved one stays readable from its
      // bookmark copy for 24 hours after it was saved.
      if (err.response?.status === 404) {
        try {
          const savedResponse = await bookmarkAPI.getOne(id);
          setArticle(savedResponse.data.data);
          setBookmarked(true);
          setLoading(false);
          return;
        } catch {
          // Not saved (or expired): fall through to the original error.
        }
      }
      setError(getErrorMessage(err, "Failed to load article"));
      setLoading(false);
    }
  }, [id]);

  const toggleBookmark = async () => {
    setBookmarkLoading(true);
    setActionError(null);
    try {
      if (bookmarked) {
        await bookmarkAPI.remove(id);
        setBookmarked(false);
      } else {
        await bookmarkAPI.save(id);
        setBookmarked(true);
      }
    } catch (err) {
      setActionError(getErrorMessage(err, "Unable to update saved article"));
    } finally {
      setBookmarkLoading(false);
    }
  };

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  // Reset tab state when navigating between articles
  useEffect(() => {
    setActiveTab("overview");
    setActionError(null);
    setDetailedNotice(null);
    setActiveParagraph(null);
  }, [id]);

  useEffect(() => {
    if (
      activeTab !== "detailed" ||
      !article ||
      DETAILED_SETTLED.has(article.detailedStatus)
    ) {
      return;
    }

    let cancelled = false;
    let pollTimer;
    let autoRetries = 0;
    const startedAt = Date.now();
    setGeneratingDetailed(true);
    setActionError(null);
    setDetailedNotice(null);

    // Give up for now: the short summary stays, with a Retry button. FAILED is
    // only set locally; the server keeps the article retryable.
    const stop = ({ error = null, notice = null } = {}) => {
      setActionError(error);
      setDetailedNotice(notice);
      setArticle((current) =>
        current ? { ...current, detailedStatus: "FAILED" } : current,
      );
      setGeneratingDetailed(false);
    };

    const readUntilComplete = async () => {
      try {
        const response =
          article.detailedStatus === "PENDING"
            ? await newsAPI.getById(id)
            : await newsAPI.generateDetailed(id);
        const nextArticle = response.data?.data;
        if (cancelled || !nextArticle) return;

        setArticle(nextArticle);
        setDetailedNotice(null);
        if (DETAILED_SETTLED.has(nextArticle.detailedStatus)) {
          setGeneratingDetailed(false);
          return;
        }

        if (Date.now() - startedAt >= 90 * 1000) {
          stop({
            error: "Detailed summary is taking too long. Please try again in a moment.",
          });
          return;
        }

        pollTimer = window.setTimeout(readUntilComplete, 2000);
      } catch (err) {
        if (cancelled) return;
        const body = err.response?.data;

        // The AI providers are out of capacity. If it is due back soon, wait
        // and ask again on our own; otherwise say so plainly. This is not an
        // error with the article, so no red alert.
        if (err.response?.status === 429) {
          const retryAfterMs = Number(body?.retryAfterMs);
          const retrySoon =
            Number.isFinite(retryAfterMs) && retryAfterMs > 0 && retryAfterMs <= AUTO_RETRY_MAX_WAIT_MS;
          if (retrySoon && autoRetries < MAX_AUTO_RETRIES) {
            autoRetries += 1;
            setDetailedNotice(
              `The AI is busy right now. Trying again in about ${Math.ceil(retryAfterMs / 1000)} seconds...`,
            );
            pollTimer = window.setTimeout(readUntilComplete, Math.max(retryAfterMs, 1000));
            return;
          }
          stop({
            notice:
              Number.isFinite(retryAfterMs) && retryAfterMs > AUTO_RETRY_MAX_WAIT_MS
                ? `Detailed summaries are paused: the AI service has reached its usage limit. Please try again ${describeWait(retryAfterMs)}.`
                : body?.message || "The AI is busy right now. Please try again in a minute.",
          });
          return;
        }

        // No reply in time, but the server carries on generating: switch to
        // watching the article for the result instead of reporting a failure.
        if (!err.response && (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT")) {
          setArticle((current) =>
            current ? { ...current, detailedStatus: "PENDING" } : current,
          );
          return;
        }

        stop({
          error: getErrorMessage(
            err,
            "Detailed summary could not be generated right now. Please try again.",
          ),
        });
      }
    };

    readUntilComplete();

    return () => {
      cancelled = true;
      window.clearTimeout(pollTimer);
    };
  }, [activeTab, article?.detailedStatus, id]);

  if (loading) {
    return (
      <div className="page page--centered">
        <div className="text-center">
          <Loader className="spinner spinner--xl" />
          <p className="text-muted loading-caption">Loading article...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page page--centered">
        <div className="container container--narrow stack stack-6">
          <BackLink />
          <div className="alert alert--error" role="alert">
            <AlertCircle className="icon icon--xl" />
            <div>
              <p className="alert-title">Error loading article</p>
              <p className="alert-body">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="page page--centered">
        <div className="container container--narrow stack stack-4">
          <BackLink />
          <p className="text-muted">Article not found</p>
        </div>
      </div>
    );
  }

  const {
    headline,
    summary,
    detailedSummary,
    detailedStatus,
    detailedConfidence,
    modelUsed,
    gist,
    keyFacts,
    bulletPoints,
    subtopics,
    category,
    source,
    date,
    url,
  } = article;
  const currentTab = TABS.some((t) => t.id === activeTab) ? activeTab : "overview";
  const facts = keyFacts?.length ? keyFacts : bulletPoints || [];

  const topic = article.category || article.topicLabel ||
    TOPIC_LABELS.find(
      (label) => label.toLowerCase().replaceAll(" & ", "-").replaceAll(" ", "-") === article.topic,
    ) || category || "Misc";
  const share = async () => {
    const shareData = {
      title: headline,
      text: gist || summary,
      url: window.location.href,
    };
    if (navigator.share) await navigator.share(shareData);
    else await navigator.clipboard.writeText(window.location.href);
  };

  return (
    <div className="page">
      <header className="site-header">
        <div className="container container--narrow site-header__inner">
          <BackLink />
          <div className="article-toolbar">
            <button
              className="btn btn-secondary btn-sm"
              onClick={toggleBookmark}
              disabled={bookmarkLoading || (article.archived && !bookmarked)}
              aria-pressed={bookmarked}
            >
              <Bookmark className="icon icon--md" fill={bookmarked ? "currentColor" : "none"} />
              {bookmarkLoading ? "Saving..." : bookmarked ? "Saved" : "Save"}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={share}>
              <Share2 className="icon icon--md" /> Share
            </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="article-original-link"
            >
              Read original
              <ExternalLink className="icon icon--md" />
            </a>
          )}
          </div>
        </div>
      </header>

      <main className="container container--narrow page-body stack stack-6">
        {article.archived && (
          <div className="alert alert--info" role="status">
            This is your saved copy; the story has left today&apos;s feed.
            {bookmarked && article.expiresAt ? ` ${formatExpiry(article.expiresAt)}.` : ""}
          </div>
        )}
        <article className="card">
          <div className="article-header">
            <div className="article-meta">
              <button
                type="button"
                className={`badge ${getCategoryClass(topic)}`}
                onClick={() => navigate(`/dashboard?category=${encodeURIComponent(topic)}`)}
              >
                {topic}
              </button>
              <span className="article-meta__item">
                <Newspaper className="icon icon--md" />
                {source || "News"}
              </span>
              <span className="article-meta__item">
                <Clock className="icon icon--md" />
                {article.publishedAt ? new Date(article.publishedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : formatDate(date) || "Date unavailable"}
              </span>
            </div>

            <h1 className="article-title">{headline}</h1>
          </div>
        </article>

        <div className="card card--flush">
          <div className="tabs" role="tablist">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab${active ? " tab--active" : ""}`}
                >
                  <Icon className="icon icon--md" />
                  <span className="tab__label">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="tab-panel">
            {actionError && (
              <div className="alert alert--error" role="alert">
                <AlertCircle className="icon icon--lg" />
                <p className="alert-body">{actionError}</p>
              </div>
            )}

            {currentTab === "overview" && (
              <div className="stack stack-6">
                <section>
                  <h3 className="eyebrow">Summary</h3>
                  <p className="article-summary">{summary}</p>
                </section>
                {facts.length > 0 ? (
                  <div>
                    <h3 className="eyebrow">Key facts</h3>
                    <ul className="key-points">
                      {facts.map((point, idx) => (
                        <li key={idx} className="key-point">
                          <span className="key-point__icon" aria-hidden="true">•</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted">No content available.</p>
                )}
              </div>
            )}

            {currentTab === "detailed" && (
              <div className="ai-summary">
                <div className="ai-summary__head">
                  <Sparkles className="icon icon--xl ai-summary__icon" />
                  <div>
                    <h3 className="ai-summary__title">AI-Generated Summary</h3>
                    <p className="ai-summary__byline">
                      {modelUsed === "deterministic-source-fallback"
                        ? "Source-based fallback while AI is unavailable"
                        : "Created by CURA AI"}
                    </p>
                  </div>
                  {detailedStatus === "DONE" && detailedSummary && (
                    <ListenButton
                      text={detailedSummary}
                      lang="en"
                      onParagraphChange={setActiveParagraph}
                    />
                  )}
                </div>
                {generatingDetailed || detailedStatus === "PENDING" ? (
                  <div className="detailed-summary-loading">
                    <Loader className="spinner spinner--md" />
                    <p>{detailedNotice || "Generating detailed summary..."}</p>
                  </div>
                ) : detailedStatus === "DONE" && detailedSummary ? (
                  <>
                    {detailedConfidence === "low" && (
                      <p className="ai-summary__notice">
                        AI summary, verify at the original source.
                      </p>
                    )}
                    {detailedSummary
                      .split(/\n{2,}/)
                      .map((paragraph) => paragraph.trim())
                      .filter(Boolean)
                      .map((paragraph, index) => (
                        <p
                          key={index}
                          className={`ai-summary__body${
                            index === activeParagraph
                              ? " ai-summary__body--speaking"
                              : ""
                          }`}
                        >
                          {paragraph}
                        </p>
                      ))}
                  </>
                ) : (
                  <div className="stack stack-3">
                    <p className="ai-summary__body">{summary}</p>
                    <p className="ai-summary__notice">
                      {detailedStatus === "UNAVAILABLE"
                        ? "A detailed summary is unavailable for this article."
                        : detailedNotice ||
                          (detailedStatus === "FAILED"
                            ? "A detailed summary couldn't be generated right now."
                            : "The short summary is shown while a detailed summary is prepared.")}
                    </p>
                    {detailedStatus === "FAILED" && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setArticle((current) => ({
                          ...current,
                          detailedStatus: "NONE",
                        }))}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </main>
      <footer className="site-footer">
        AI-generated summary. May contain errors. Verify important facts at the source.
      </footer>
    </div>
  );
}

function BackLink() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/dashboard")}
      className="back-link"
      aria-label="Back to dashboard"
    >
      <ArrowLeft className="icon icon--lg" />
      <span className="back-link__label">Back</span>
    </button>
  );
}
