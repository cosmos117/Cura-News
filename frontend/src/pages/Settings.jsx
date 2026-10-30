import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Loader,
  LogOut,
  Newspaper,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { TOPIC_LABEL_BY_ID } from "../constants/news";
import { topicIcon } from "../constants/topicIcons";

const initialsOf = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";

export default function Settings() {
  const { user, logout, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const preferences = user?.preferences || {};
  const pickedSources = preferences.sources || [];
  const pickedTopics = (preferences.topics || [])
    .map((id) => TOPIC_LABEL_BY_ID[id])
    .filter(Boolean);
  const hasPicks = pickedSources.length > 0 && pickedTopics.length > 0;

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const cancelDelete = () => {
    if (deleting) return;
    setConfirming(false);
    setError(null);
  };

  // Escape closes the confirmation dialog.
  useEffect(() => {
    if (!confirming) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") cancelDelete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    const result = await deleteAccount();
    if (!result.success) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    navigate("/login", { replace: true });
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
              <p className="brand__date">Settings</p>
            </div>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/dashboard")}>
            Back to news
          </button>
        </div>
      </header>

      <main className="container page-body">
        <div className="settings">
          <h2 className="section-title settings__title">
            <SettingsIcon className="icon icon--md" /> Settings
          </h2>

          <section className="settings-card" aria-labelledby="settings-profile">
            <h3 id="settings-profile" className="settings-card__title">Your account</h3>
            <div className="profile">
              {user?.avatar && !avatarFailed ? (
                <img
                  className="profile__avatar"
                  src={user.avatar}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <span className="profile__avatar" aria-hidden="true">
                  {initialsOf(user?.name)}
                </span>
              )}
              <div className="profile__details">
                <p className="profile__name">{user?.name}</p>
                <p className="profile__email">{user?.email}</p>
                <div className="pick-chips">
                  {user?.hasPassword && <span className="badge badge--gray">Email &amp; password</span>}
                  {user?.hasGoogle && <span className="badge badge--blue">Google</span>}
                </div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm profile__logout" onClick={handleLogout}>
                <LogOut className="icon icon--md" />
                Log out
              </button>
            </div>
          </section>

          <section className="settings-card" aria-labelledby="settings-feed">
            <h3 id="settings-feed" className="settings-card__title">Your For You feed</h3>
            {hasPicks ? (
              <>
                <p className="settings-card__hint">
                  For You shows today&apos;s stories from these papers and topics.
                </p>
                <p className="eyebrow">Papers</p>
                <ul className="pick-chips settings__picks">
                  {pickedSources.map((source) => (
                    <li key={source} className="pick-chip">
                      <Newspaper className="icon icon--sm" />
                      {source}
                    </li>
                  ))}
                </ul>
                <p className="eyebrow">Topics</p>
                <ul className="pick-chips settings__picks">
                  {pickedTopics.map((topic) => {
                    const Icon = topicIcon(topic);
                    return (
                      <li key={topic} className="pick-chip">
                        <Icon className="icon icon--sm" />
                        {topic}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="settings-card__hint">
                Not set up yet. Pick your papers and topics to get a feed of just the news
                you care about.
              </p>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate("/welcome")}>
              <Sparkles className="icon icon--md" />
              {hasPicks ? "Edit picks" : "Set up For You"}
            </button>
          </section>

          <section className="settings-card settings-card--danger" aria-labelledby="settings-delete">
            <h3 id="settings-delete" className="settings-card__title">Delete account</h3>
            <p className="settings-card__hint">
              This permanently deletes your account, your For You picks and your saved
              articles. It cannot be undone.
            </p>

            <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirming(true)}>
              <Trash2 className="icon icon--md" />
              Delete account
            </button>
          </section>
        </div>
      </main>

      {confirming && (
        <div className="modal-backdrop" onClick={cancelDelete}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-text"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="modal__icon" aria-hidden="true">
              <Trash2 className="icon icon--xl" />
            </span>
            <h2 id="delete-dialog-title" className="modal__title">
              Delete your account?
            </h2>
            <p id="delete-dialog-text" className="modal__text">
              Are you sure? Your account, picks and saved articles will be deleted
              permanently. This cannot be undone.
            </p>

            {error && (
              <div className="alert alert--error" role="alert">
                <AlertCircle className="icon icon--lg" />
                <p className="alert-body">{error}</p>
              </div>
            )}

            <div className="modal__actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cancelDelete}
                disabled={deleting}
                autoFocus
              >
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? (
                  <>
                    <Loader className="icon icon--sm spinner spinner--sm" />
                    Deleting...
                  </>
                ) : (
                  "Yes, delete my account"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
