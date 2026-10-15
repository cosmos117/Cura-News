import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { newsAPI } from "../services/api";
import { getCategoryClass, getTagClass } from "../constants/news";
import { TOPIC_LABELS } from "../constants/news";
import { formatDate, getErrorMessage } from "../utils/format";
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

export default function Article() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("article");
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [generatingDetailed, setGeneratingDetailed] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const fetchArticle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await newsAPI.getById(id);
      setArticle(response.data.data);
      setLoading(false);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load article"));
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  // Reset tab state when navigating between articles
  useEffect(() => {
    setActiveTab("overview");
    setActionError(null);
  }, [id]);

  useEffect(() => {
    if (
      activeTab !== "detailed" ||
      !article ||
      article.detailedStatus === "DONE" ||
      article.detailedStatus === "FAILED" ||
      article.detailedStatus === "UNAVAILABLE"
    ) {
      return;
    }

    let cancelled = false;
    let pollTimer;
    setGeneratingDetailed(true);
    setActionError(null);

    const readUntilComplete = async () => {
      try {
        const response =
          article.detailedStatus === "PENDING"
            ? await newsAPI.getById(id)
            : await newsAPI.generateDetailed(id);
        const nextArticle = response.data?.data;
        if (cancelled || !nextArticle) return;

        setArticle(nextArticle);
        if (
          nextArticle.detailedStatus === "DONE" ||
          nextArticle.detailedStatus === "FAILED" ||
          nextArticle.detailedStatus === "UNAVAILABLE"
        ) {
          if (nextArticle.detailedStatus === "DONE") {
            setActionError(null);
          }
          setGeneratingDetailed(false);
          return;
        }

        pollTimer = window.setTimeout(readUntilComplete, 2000);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.data?.data) {
          setArticle(err.response.data.data);
        }
        setActionError(
          getErrorMessage(err, "Detailed summary generation failed"),
        );
        setGeneratingDetailed(false);
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
    gist,
    keyFacts,
    bulletPoints,
    subtopics,
    tags,
    category,
    source,
    date,
    url,
  } = article;
  const currentTab = TABS.some((t) => t.id === activeTab) ? activeTab : "overview";
  const facts = keyFacts?.length ? keyFacts : bulletPoints || [];
  const topic = article.topicLabel ||
    TOPIC_LABELS.find(
      (label) => label.toLowerCase().replaceAll(" & ", "-").replaceAll(" ", "-") === article.topic,
    ) || category || "Other";
  const share = async () => {
    const shareData = { title: headline, text: gist || summary, url: window.location.href };
    if (navigator.share) await navigator.share(shareData);
    else await navigator.clipboard.writeText(window.location.href);
  };

  return (
    <div className="page">
      <header className="site-header">
        <div className="container container--narrow site-header__inner">
          <BackLink />
          <div className="article-toolbar">
            <button className="btn btn-secondary btn-sm" onClick={() => setBookmarked((value) => !value)}>
              <Bookmark className="icon icon--md" fill={bookmarked ? "currentColor" : "none"} />
              {bookmarked ? "Saved" : "Save"}
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

            {gist && <p className="article-deck">{gist}</p>}
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
                    <p className="ai-summary__byline">Created by CURA AI</p>
                  </div>
                </div>
                {generatingDetailed || detailedStatus === "PENDING" ? (
                  <div className="detailed-summary-loading">
                    <Loader className="spinner spinner--md" />
                    <p>Generating detailed summary...</p>
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
                      .map((paragraph, index) => (
                        <p key={index} className="ai-summary__body">
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
                        : "The short summary is shown while a detailed summary is prepared."}
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
