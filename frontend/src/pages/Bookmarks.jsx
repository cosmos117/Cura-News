import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, Loader, Trash2 } from "lucide-react";
import { bookmarkAPI } from "../services/api";
import { formatExpiry, getErrorMessage } from "../utils/format";
import ArticleCard from "../components/ArticleCard";

// Matches the per-reader cap, so every saved article fits on one page.
const MAX_SAVED = 50;

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
      const response = await bookmarkAPI.getAll({ limit: MAX_SAVED });
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
              {pagination.total || 0} of {pagination.max || MAX_SAVED} saved
              {" "}· saved articles are kept for 30 days
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
              <ArticleCard
                key={article._id}
                article={article}
                onClick={() => navigate(`/article/${article._id}`)}
                note={formatExpiry(article.expiresAt)}
                actions={
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => remove(article._id)}
                    disabled={removingId === article._id}
                    aria-label={`Remove ${article.headline} from saved articles`}
                    title="Remove from saved articles"
                  >
                    <Trash2 className="icon icon--md" />
                  </button>
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
