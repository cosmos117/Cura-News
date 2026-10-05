import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { newsAPI, quizAPI, notesAPI } from "../services/api";
import { getCategoryClass, getTagClass } from "../constants/news";
import { formatDate, getErrorMessage } from "../utils/format";
import {
  ArrowLeft,
  Loader,
  AlertCircle,
  Sparkles,
  BookOpen,
  HelpCircle,
  Clock,
  Newspaper,
  CheckCircle,
  XCircle,
  MessageSquare,
  Plus,
  Trash2,
  Tag,
  FileText,
  ListChecks,
  ExternalLink,
} from "lucide-react";

const NOTE_MIN = 10;
const NOTE_MAX = 2000;

const TABS = [
  { id: "article", label: "Article", icon: FileText },
  { id: "summary", label: "Summary", icon: Sparkles, requiresSummary: true },
  { id: "quiz", label: "Quiz", icon: HelpCircle, requiresQuiz: true },
  { id: "notes", label: "Notes", icon: BookOpen, requiresAuth: true },
];

export default function Article() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const [article, setArticle] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("article");
  const [error, setError] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResults, setQuizResults] = useState(null);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [newNote, setNewNote] = useState({ content: "", tags: "" });
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [generatingDetailed, setGeneratingDetailed] = useState(false);

  /**
   * Load the article, then the quiz and notes.
   *
   * Quiz and notes are fetched separately so a failure in one does not blank
   * the page. Each previously swallowed its error silently.
   */
  const fetchArticle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await newsAPI.getById(id);
      setArticle(response.data.data);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load article"));
      setLoading(false);
      return;
    }

    const [quizResult, notesResult] = await Promise.allSettled([
      quizAPI.getQuiz(id),
      notesAPI.getByArticle(id),
    ]);

    setQuiz(
      quizResult.status === "fulfilled" ? quizResult.value.data.data : null,
    );
    setNotes(
      notesResult.status === "fulfilled" ? notesResult.value.data.data || [] : [],
    );

    setLoading(false);
  }, [id]);

  // isAuthenticated is a dependency: if auth resolves after mount, the quiz
  // and notes must still be fetched.
  useEffect(() => {
    fetchArticle();
  }, [fetchArticle, isAuthenticated]);

  // Reset tab state when navigating between articles
  useEffect(() => {
    setActiveTab("article");
    setQuizAnswers({});
    setQuizResults(null);
    setActionError(null);
  }, [id]);

  useEffect(() => {
    if (
      activeTab !== "summary" ||
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

  const selectAnswer = (questionIdx, answer) =>
    setQuizAnswers((prev) => ({ ...prev, [questionIdx]: answer }));

  const handleSubmitQuiz = async () => {
    const total = quiz?.questions?.length ?? 0;
    if (Object.keys(quizAnswers).length !== total) {
      setActionError("Please answer every question before submitting.");
      return;
    }

    setSubmittingQuiz(true);
    setActionError(null);
    try {
      const answers = Array.from({ length: total }, (_, i) => quizAnswers[i]);
      const response = await quizAPI.submitQuiz({ articleId: id, answers });
      setQuizResults(response.data.data);
    } catch (err) {
      setActionError(getErrorMessage(err, "Failed to submit quiz"));
    } finally {
      setSubmittingQuiz(false);
    }
  };

  const retryQuiz = () => {
    setQuizAnswers({});
    setQuizResults(null);
    setActionError(null);
  };

  const handleAddNote = async () => {
    const content = newNote.content.trim();

    // The backend requires 10-2000 characters; validate here so the user gets
    // a specific message instead of an opaque 400.
    if (content.length < NOTE_MIN) {
      setActionError(`Note must be at least ${NOTE_MIN} characters.`);
      return;
    }
    if (content.length > NOTE_MAX) {
      setActionError(`Note cannot exceed ${NOTE_MAX} characters.`);
      return;
    }

    setSavingNote(true);
    setActionError(null);
    try {
      const response = await notesAPI.create({
        articleId: id,
        content,
        tags: newNote.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      // Local update instead of a full page refetch.
      setNotes((prev) => [response.data.data, ...prev]);
      setNewNote({ content: "", tags: "" });
      setShowNoteForm(false);
    } catch (err) {
      setActionError(getErrorMessage(err, "Failed to create note"));
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm("Delete this note?")) return;
    setActionError(null);
    try {
      await notesAPI.delete(noteId);
      setNotes((prev) => prev.filter((note) => note._id !== noteId));
    } catch (err) {
      setActionError(getErrorMessage(err, "Failed to delete note"));
    }
  };

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
    bulletPoints,
    subtopics,
    tags,
    category,
    source,
    date,
    url,
  } = article;
  const hasQuiz = Boolean(quiz?.questions?.length);

  const visibleTabs = TABS.filter((tab) => {
    if (tab.requiresSummary) return Boolean(summary);
    if (tab.requiresQuiz) return hasQuiz && isAuthenticated;
    if (tab.requiresAuth) return isAuthenticated;
    return true;
  });

  // Fall back to a valid tab if the active one is no longer available
  const currentTab = visibleTabs.some((t) => t.id === activeTab)
    ? activeTab
    : visibleTabs[0]?.id;

  return (
    <div className="page">
      <header className="site-header">
        <div className="container container--narrow site-header__inner">
          <BackLink />
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
      </header>

      <main className="container container--narrow page-body stack stack-6">
        <article className="card">
          <div className="article-header">
            <div className="article-meta">
              <span className={`badge ${getCategoryClass(category)}`}>
                {category || "Other"}
              </span>
              <span className="article-meta__item">
                <Newspaper className="icon icon--md" />
                {source || "News"}
              </span>
              <span className="article-meta__item">
                <Clock className="icon icon--md" />
                {formatDate(date) || "Date unavailable"}
              </span>
            </div>

            <h1 className="article-title">{headline}</h1>

            {summary && <p className="article-deck">{summary}</p>}

            {tags?.length > 0 && (
              <div className="tag-list">
                {tags.map((tag) => (
                  <span key={tag} className={`badge ${getTagClass(tag)}`}>
                    <Tag className="icon icon--sm" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </article>

        <div className="card card--flush">
          <div className="tabs" role="tablist">
            {visibleTabs.map((tab) => {
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

            {currentTab === "article" && (
              <div className="stack stack-6">
                {subtopics?.length > 0 && (
                  <div>
                    <h3 className="eyebrow">Subtopics</h3>
                    <div className="tag-list">
                      {subtopics.map((sub) => (
                        <span key={sub} className="badge badge--gray">
                          {sub}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {bulletPoints?.length > 0 ? (
                  <div>
                    <h3 className="eyebrow">Key points</h3>
                    <ul className="key-points">
                      {bulletPoints.map((point, idx) => (
                        <li key={idx} className="key-point">
                          <ListChecks className="key-point__icon icon icon--lg" />
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

            {currentTab === "summary" && summary && (
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
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link"
                      >
                        Read full story at source
                      </a>
                    )}
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

            {currentTab === "quiz" && hasQuiz && (
              <QuizPanel
                quiz={quiz}
                answers={quizAnswers}
                results={quizResults}
                submitting={submittingQuiz}
                onSelect={selectAnswer}
                onSubmit={handleSubmitQuiz}
                onRetry={retryQuiz}
              />
            )}

            {currentTab === "notes" && (
              <NotesPanel
                notes={notes}
                currentUserId={user?.id}
                newNote={newNote}
                showForm={showNoteForm}
                saving={savingNote}
                onToggleForm={() => setShowNoteForm((prev) => !prev)}
                onChange={(field, value) =>
                  setNewNote((prev) => ({ ...prev, [field]: value }))
                }
                onSave={handleAddNote}
                onDelete={handleDeleteNote}
              />
            )}
          </div>
        </div>
      </main>
      <footer className="site-footer">
        Summaries are AI-generated and may contain errors. Always verify with the original source.
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

function QuizPanel({
  quiz,
  answers,
  results,
  submitting,
  onSelect,
  onSubmit,
  onRetry,
}) {
  if (results) {
    const passed = results.percentage >= 60;

    return (
      <div className="stack stack-6">
        <div
          className={`quiz-result ${passed ? "quiz-result--pass" : "quiz-result--fail"}`}
        >
          {passed ? (
            <CheckCircle className="icon--2xl quiz-result__icon--pass" />
          ) : (
            <XCircle className="icon--2xl quiz-result__icon--fail" />
          )}

          <h3 className="title-lg">Quiz Completed</h3>

          <div className="quiz-score">
            <div>
              <p className="quiz-score__value quiz-score__value--score">
                {results.score}
              </p>
              <p className="quiz-score__label">Score</p>
            </div>
            <div>
              <p className="quiz-score__value quiz-score__value--total">
                {results.total}
              </p>
              <p className="quiz-score__label">Total</p>
            </div>
            <div>
              <p className="quiz-score__value quiz-score__value--percent">
                {results.percentage}%
              </p>
              <p className="quiz-score__label">Percentage</p>
            </div>
          </div>

          <div className="quiz-level">{results.resultLevel}</div>
        </div>

        {/* Per-question review, using the correctAnswer/isCorrect the API returns */}
        <div className="stack stack-4">
          <h4 className="section-title">Answer review</h4>
          {results.questions?.map((q, idx) => (
            <div
              key={idx}
              className={`quiz-review ${
                q.isCorrect ? "quiz-review--correct" : "quiz-review--wrong"
              }`}
            >
              {q.isCorrect ? (
                <CheckCircle className="icon icon--lg quiz-review__icon--correct" />
              ) : (
                <XCircle className="icon icon--lg quiz-review__icon--wrong" />
              )}
              <div>
                <p className="text-sm quiz-review__question">
                  {q.questionNumber}. {q.question}
                </p>
                <p className="text-sm text-muted">
                  Your answer: <strong>{q.userAnswer}</strong>
                  {!q.isCorrect && (
                    <>
                      {" · Correct answer: "}
                      <strong className="text-success">
                        {q.correctAnswer}
                      </strong>
                    </>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onRetry} className="link block-link">
          Retake Quiz
        </button>
      </div>
    );
  }

  return (
    <div className="stack stack-6">
      <div className="quiz-intro">
        Answer all {quiz.questions.length} questions to test your knowledge
      </div>

      {quiz.questions.map((question, idx) => (
        <fieldset key={idx} className="quiz-question">
          <legend className="sr-only">Question {idx + 1}</legend>
          <div className="quiz-question__head">
            <span className="quiz-question__number">{idx + 1}</span>
            <p className="quiz-question__text">{question.question}</p>
          </div>
          <div className="quiz-question__options">
            {question.options?.map((option, optIdx) => {
              const letter = String.fromCharCode(65 + optIdx);
              const isSelected = answers[idx] === letter;
              return (
                <label
                  key={optIdx}
                  className={`radio-option${
                    isSelected ? " radio-option--selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name={`q${idx}`}
                    value={letter}
                    checked={isSelected}
                    onChange={() => onSelect(idx, letter)}
                  />
                  <span className="option-label">
                    <strong>{letter}.</strong> {option}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <button
        onClick={onSubmit}
        disabled={submitting}
        className="btn btn-primary btn-cta"
      >
        {submitting ? "Submitting..." : "Submit Quiz"}
      </button>
    </div>
  );
}

function NotesPanel({
  notes,
  currentUserId,
  newNote,
  showForm,
  saving,
  onToggleForm,
  onChange,
  onSave,
  onDelete,
}) {
  const myNotes = notes.filter(
    (note) => note.userId?._id && note.userId._id === currentUserId,
  );
  const otherNotes = notes.filter(
    (note) => !note.userId?._id || note.userId._id !== currentUserId,
  );

  const NoteCard = ({ note, isMine }) => (
    <div className={`note ${isMine ? "note--mine" : "note--other"}`}>
      <div className="note__head">
        <div className="note__author">
          <Newspaper className="icon icon--md" />
          <span className="note__author-name">{note.userId?.name || "Student"}</span>
          {note.isPinned && <span className="badge badge--sm badge--amber">Pinned</span>}
        </div>

        {/* Delete is offered only on the caller's own notes. The public
            per-article endpoint returns every user's notes; offering a delete
            button on someone else's note was misleading (it fails with 403). */}
        {isMine && (
          <button
            onClick={() => onDelete(note._id)}
            className="icon-btn icon-btn--danger"
            aria-label="Delete note"
          >
            <Trash2 className="icon icon--lg" />
          </button>
        )}
      </div>

      <p className="note__content">{note.content}</p>

      {note.tags?.length > 0 && (
        <div className="note__tags">
          {note.tags.map((tag) => (
            <span key={tag} className="badge badge--sm badge--amber">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="stack stack-6">
      {showForm ? (
        <div className="note-form stack stack-4">
          <h4 className="title-md">Create New Note</h4>

          <textarea
            placeholder="What stood out in this article?"
            value={newNote.content}
            onChange={(e) => onChange("content", e.target.value)}
            rows={4}
            maxLength={NOTE_MAX}
            className="textarea"
            aria-label="Note content"
          />

          <div className="field-hint-row">
            <span>
              {NOTE_MIN}-{NOTE_MAX} characters
            </span>
            <span>
              {newNote.content.length}/{NOTE_MAX}
            </span>
          </div>

          <input
            type="text"
            placeholder="Tags (comma-separated, max 5)"
            value={newNote.tags}
            onChange={(e) => onChange("tags", e.target.value)}
            className="input"
            aria-label="Note tags"
          />

          <div className="row row-3">
            <button
              onClick={onSave}
              disabled={saving}
              className="btn btn-warning btn-block-sm"
            >
              {saving ? "Saving..." : "Save Note"}
            </button>
            <button onClick={onToggleForm} className="btn btn-secondary btn-block-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={onToggleForm} className="btn btn-success btn-block">
          <Plus className="icon icon--lg" />
          Create New Note
        </button>
      )}

      <section>
        <h4 className="section-title">Your notes ({myNotes.length})</h4>
        {myNotes.length === 0 ? (
          <div className="empty-state">
            <MessageSquare className="empty-state__icon icon--2xl" />
            <p className="empty-state__title">
              You have not saved any notes on this article
            </p>
          </div>
        ) : (
          <div className="note-list">
            {myNotes.map((note) => (
              <NoteCard key={note._id} note={note} isMine />
            ))}
          </div>
        )}
      </section>

      {otherNotes.length > 0 && (
        <section>
          <h4 className="section-title">
            Notes from other students ({otherNotes.length})
          </h4>
          <div className="note-list">
            {otherNotes.map((note) => (
              <NoteCard key={note._id} note={note} isMine={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}