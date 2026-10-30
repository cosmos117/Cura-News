import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, ExternalLink, Loader, Trash2 } from "lucide-react";
import { bookmarkAPI } from "../services/api";
import { formatExpiry, getErrorMessage } from "../utils/format";

const PAGE_SIZE = 20;

export default function Bookmarks() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState(null);

  const fetchBookmarks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await bookmarkAPI.getAll({ limit: PAGE_SIZE });
      setArticles(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, hasMore: false });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load saved articles"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  const remove = async (articleId) => {
    setRemovingId(articleId);
    setError(null);
    try {
      await bookmarkAPI.remove(articleId);
      setArticles((current) => current.filter((article) => article._id !== articleId));
      setPagination((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
      }));
    } catch (err) {
      setError(getErrorMessage(err, "Unable to remove saved article"));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="page">
      <header className="site-header">
        <div className="container site-header__inner">
          <button className="brand brand--button" onClick={() => navigate("/dashboard")}>
            <div className="brand__mark">
              <img src="/logo.svg" alt="" width="40" height="40" />
            </div>
            <div>
              <h1 className="brand__name">CURA News</h1>
              <p className="brand__date">Saved Articles</p>
            </div>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/dashboard")}>
            Back to news
          </button>
        </div>
      </header>

      <main className="container page-body stack stack-6">
        <div className="row row-between">
          <div>
            <h2 className="section-title">
              <Bookmark className="icon icon--md" /> Saved Articles
            </h2>
            <p className="text-muted">
              {pagination.total || 0} {pagination.total === 1 ? "article" : "articles"} saved
              {" "}· saved articles are kept for 24 hours
            </p>
          </div>
        </div>

        {error && <div className="alert alert--error" role="alert">{error}</div>}

        {loading ? (
          <div className="card card--centered">
            <Loader className="spinner spinner--lg" />
            <p className="text-muted">Loading saved articles...</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="empty-state card">
            <Bookmark className="empty-state__icon" />
            <h3 className="empty-state__title">No saved articles yet</h3>
            <p className="empty-state__hint">
              Save important stories from an article page to read them here later.
            </p>
            <button className="btn btn-primary" onClick={() => navigate("/dashboard")}>
              Browse today&apos;s news
            </button>
          </div>
        ) : (
          <div className="grid-cards">
            {articles.map((article) => (
              <article className="article-card card--hover" key={article._id}>
                <div className="article-card__body">
                  <div className="article-card__meta">
                    <span>{article.source || "News"}</span>
                    <span>{article.topicLabel || article.category || "Misc"}</span>
                    <span>{formatExpiry(article.expiresAt)}</span>
                  </div>
                  <h3 className="article-card__title">{article.headline}</h3>
                  <p className="article-card__summary">{article.gist || article.summary}</p>
                  <div className="article-card__footer">
                    <button className="article-card__link" onClick={() => navigate(`/article/${article._id}`)}>
                      Read article <ExternalLink className="icon icon--sm" />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => remove(article._id)}
                      disabled={removingId === article._id}
                      aria-label={`Remove ${article.headline} from saved articles`}
                      title="Remove from saved articles"
                    >
                      <Trash2 className="icon icon--md" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
