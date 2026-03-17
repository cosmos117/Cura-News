import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { newsAPI, quizAPI, notesAPI } from "../services/api";
import {
  ArrowLeft,
  Loader,
  AlertCircle,
  Sparkles,
  BookOpen,
  HelpCircle,
  Heart,
  Clock,
  User,
  Share2,
  CheckCircle,
  XCircle,
  MessageSquare,
  Plus,
  Trash2,
  Tag,
  FileText,
} from "lucide-react";

export default function Article() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [article, setArticle] = useState(null);
  const [summary, setSummary] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("content");
  const [error, setError] = useState(null);
  const [liked, setLiked] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResults, setQuizResults] = useState(null);
  const [newNote, setNewNote] = useState({ title: "", content: "", tags: "" });
  const [showNoteForm, setShowNoteForm] = useState(false);

  useEffect(() => {
    fetchArticle();
  }, [id]);

  const fetchArticle = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await newsAPI.getById(id);
      setArticle(response.data.data);

      // Fetch summary if available
      try {
        const summaryResponse = await newsAPI.getSummary(id);
        setSummary(summaryResponse.data.data.summary);
      } catch (err) {
        console.log("Summary not available");
      }

      // Fetch quiz if authenticated
      if (isAuthenticated) {
        try {
          const quizResponse = await quizAPI.getQuiz(id);
          setQuiz(quizResponse.data.data);
        } catch (err) {
          console.log("Quiz not available");
        }

        // Fetch notes
        try {
          const notesResponse = await notesAPI.getByArticle(id);
          setNotes(notesResponse.data.data || []);
        } catch (err) {
          console.log("Notes not available");
        }
      }
    } catch (err) {
      setError("Failed to load article");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuizAnswer = (questionIdx, answer) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [questionIdx]: answer,
    }));
  };

  const handleSubmitQuiz = async () => {
    if (Object.keys(quizAnswers).length !== quiz.questions?.length) {
      alert("Please answer all questions");
      return;
    }

    setQuizSubmitted(true);
    const answers = Object.keys(quizAnswers)
      .sort((a, b) => a - b)
      .map((key) => quizAnswers[key]);

    try {
      const response = await quizAPI.submitQuiz({
        articleId: id,
        answers,
      });
      setQuizResults(response.data.data);
    } catch (err) {
      alert("Failed to submit quiz");
      console.error(err);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.title || !newNote.content) {
      alert("Please fill in title and content");
      return;
    }

    try {
      await notesAPI.create({
        articleId: id,
        title: newNote.title,
        content: newNote.content,
        tags: newNote.tags
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t),
      });
      setNewNote({ title: "", content: "", tags: "" });
      setShowNoteForm(false);
      fetchArticle();
    } catch (err) {
      alert("Failed to create note");
      console.error(err);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm("Delete this note?")) return;
    try {
      await notesAPI.delete(noteId);
      fetchArticle();
    } catch (err) {
      alert("Failed to delete note");
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading article...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6 font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>
          <div className="bg-red-50 border-l-4 border-red-600 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-red-900">
                  Error Loading Article
                </h3>
                <p className="text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <p className="text-gray-600">Article not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              title="Share article"
            >
              <Share2 className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={() => setLiked(!liked)}
              className={`p-2 rounded-lg transition ${
                liked
                  ? "bg-red-100 text-red-600"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Heart className={`w-5 h-5 ${liked ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Article Header */}
        <article className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
          {article.imageUrl && (
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full h-96 object-cover"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          )}
          <div className="p-6 sm:p-10">
            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b border-gray-200">
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
                {article.category || "News"}
              </span>
              <div className="flex items-center gap-2 text-gray-600 text-sm">
                <Clock className="w-4 h-4" />
                {new Date(article.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="flex items-center gap-2 text-gray-600 text-sm">
                <User className="w-4 h-4" />
                {article.source || "News Source"}
              </div>
            </div>

            {/* Title */}
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 leading-tight">
              {article.title}
            </h1>

            {/* Description */}
            <p className="text-lg text-gray-600 leading-relaxed mb-6">
              {article.description}
            </p>

            {/* Tags */}
            {article.tags && article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {article.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 text-sm font-medium px-3 py-1 rounded-full"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </article>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200 flex overflow-x-auto">
            <button
              onClick={() => setActiveTab("content")}
              className={`flex-1 min-w-[140px] px-6 py-4 font-semibold text-center border-b-2 transition ${
                activeTab === "content"
                  ? "text-blue-600 border-blue-600 bg-blue-50"
                  : "text-gray-600 border-transparent hover:text-gray-900"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Article</span>
              </div>
            </button>
            {summary && (
              <button
                onClick={() => setActiveTab("summary")}
                className={`flex-1 min-w-[140px] px-6 py-4 font-semibold text-center border-b-2 transition ${
                  activeTab === "summary"
                    ? "text-blue-600 border-blue-600 bg-blue-50"
                    : "text-gray-600 border-transparent hover:text-gray-900"
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">Summary</span>
                </div>
              </button>
            )}
            {quiz && isAuthenticated && (
              <button
                onClick={() => setActiveTab("quiz")}
                className={`flex-1 min-w-[140px] px-6 py-4 font-semibold text-center border-b-2 transition ${
                  activeTab === "quiz"
                    ? "text-blue-600 border-blue-600 bg-blue-50"
                    : "text-gray-600 border-transparent hover:text-gray-900"
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Quiz</span>
                </div>
              </button>
            )}
            {isAuthenticated && (
              <button
                onClick={() => setActiveTab("notes")}
                className={`flex-1 min-w-[140px] px-6 py-4 font-semibold text-center border-b-2 transition ${
                  activeTab === "notes"
                    ? "text-blue-600 border-blue-600 bg-blue-50"
                    : "text-gray-600 border-transparent hover:text-gray-900"
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  <span className="hidden sm:inline">Notes</span>
                </div>
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="p-6 sm:p-10">
            {/* Full Article Content */}
            {activeTab === "content" && (
              <div className="prose prose-sm max-w-none">
                <ContentRenderer
                  content={article.content || article.description}
                />
              </div>
            )}

            {/* AI Summary */}
            {activeTab === "summary" && summary && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <Sparkles className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-bold text-blue-900 text-lg">
                        AI-Generated Summary
                      </h3>
                      <p className="text-sm text-blue-700">
                        Created by CURA AI
                      </p>
                    </div>
                  </div>
                  <p className="text-gray-800 leading-relaxed text-lg">
                    {summary}
                  </p>
                </div>
              </div>
            )}

            {/* Quiz Section */}
            {activeTab === "quiz" && quiz && (
              <div className="space-y-6">
                {quizSubmitted && quizResults ? (
                  <div className="space-y-6">
                    {/* Results Summary */}
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-6">
                      <div className="text-center">
                        <div className="inline-block bg-green-100 p-4 rounded-full mb-4">
                          <CheckCircle className="w-12 h-12 text-green-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-green-900 mb-2">
                          Quiz Completed!
                        </h3>
                        <div className="grid grid-cols-3 gap-4 mt-6">
                          <div>
                            <p className="text-3xl font-bold text-green-600">
                              {quizResults.score}
                            </p>
                            <p className="text-sm text-green-700">Score</p>
                          </div>
                          <div>
                            <p className="text-3xl font-bold text-blue-600">
                              {quizResults.total}
                            </p>
                            <p className="text-sm text-blue-700">Total</p>
                          </div>
                          <div>
                            <p className="text-3xl font-bold text-purple-600">
                              {quizResults.percentage}%
                            </p>
                            <p className="text-sm text-purple-700">
                              Percentage
                            </p>
                          </div>
                        </div>
                        <div className="mt-6 inline-block bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-2 rounded-full font-semibold">
                          {quizResults.resultLevel}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Results */}
                    <button
                      onClick={() => setQuizSubmitted(false)}
                      className="w-full text-blue-600 hover:text-blue-700 font-semibold py-2"
                    >
                      Review Answers
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
                      <p className="text-blue-900 font-medium">
                        Answer all {quiz.questions?.length} questions to test
                        your knowledge
                      </p>
                    </div>

                    {quiz.questions?.map((question, idx) => (
                      <div
                        key={idx}
                        className="border border-gray-300 rounded-lg p-6 hover:shadow-md transition"
                      >
                        <div className="flex items-start gap-4 mb-4">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex-shrink-0">
                            {idx + 1}
                          </div>
                          <p className="font-semibold text-gray-900 text-lg">
                            {question.question}
                          </p>
                        </div>
                        <div className="space-y-3 ml-12">
                          {question.options?.map((option, optIdx) => {
                            const letter = String.fromCharCode(65 + optIdx); // A, B, C, D
                            const isSelected = quizAnswers[idx] === letter;
                            return (
                              <label
                                key={optIdx}
                                className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition ${
                                  isSelected
                                    ? "border-blue-600 bg-blue-50"
                                    : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`q${idx}`}
                                  value={letter}
                                  checked={isSelected}
                                  onChange={() => handleQuizAnswer(idx, letter)}
                                  className="w-5 h-5 accent-blue-600"
                                />
                                <span className="font-medium text-gray-900">
                                  {option}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={handleSubmitQuiz}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 px-6 rounded-lg transition shadow-md hover:shadow-lg"
                    >
                      Submit Quiz
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Notes Section */}
            {activeTab === "notes" && (
              <div className="space-y-6">
                {/* New Note Form */}
                {showNoteForm ? (
                  <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-lg p-6 space-y-4">
                    <h4 className="font-bold text-lg text-gray-900">
                      Create New Note
                    </h4>
                    <input
                      type="text"
                      placeholder="Note title..."
                      value={newNote.title}
                      onChange={(e) =>
                        setNewNote({
                          ...newNote,
                          title: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none"
                    />
                    <textarea
                      placeholder="Write your note here..."
                      value={newNote.content}
                      onChange={(e) =>
                        setNewNote({
                          ...newNote,
                          content: e.target.value,
                        })
                      }
                      rows="4"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none resize-none"
                    />
                    <input
                      type="text"
                      placeholder="Tags (comma-separated)"
                      value={newNote.tags}
                      onChange={(e) =>
                        setNewNote({
                          ...newNote,
                          tags: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={handleAddNote}
                        className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                      >
                        Save Note
                      </button>
                      <button
                        onClick={() => setShowNoteForm(false)}
                        className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold py-2 px-4 rounded-lg transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNoteForm(true)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                  >
                    <Plus className="w-5 h-5" />
                    Create New Note
                  </button>
                )}

                {/* Existing Notes */}
                {notes.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 mb-2">No notes yet</p>
                    <p className="text-sm text-gray-500">
                      Create your first note to get started
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {notes.map((note) => (
                      <div
                        key={note._id}
                        className="bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-lg p-6 hover:shadow-md transition"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h5 className="font-bold text-lg text-gray-900">
                            {note.title}
                          </h5>
                          <button
                            onClick={() => handleDeleteNote(note._id)}
                            className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                        <p className="text-gray-800 mb-4 leading-relaxed">
                          {note.content}
                        </p>
                        {note.tags && note.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {note.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="bg-yellow-200 text-yellow-800 text-xs font-semibold px-3 py-1 rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// Content Renderer Component for bullet points and formatting
function ContentRenderer({ content }) {
  if (!content) {
    return <p className="text-gray-600">No content available</p>;
  }

  const paragraphs = content.split("\n\n");

  return (
    <div className="space-y-6">
      {paragraphs.map((paragraph, idx) => {
        // Check if it's a bullet list
        if (
          paragraph.trim().startsWith("-") ||
          paragraph.trim().startsWith("•")
        ) {
          const bullets = paragraph.split("\n").filter((line) => line.trim());
          return (
            <ul key={idx} className="space-y-3 ml-4">
              {bullets.map((bullet, bIdx) => (
                <li
                  key={bIdx}
                  className="flex items-start gap-3 text-gray-800 leading-relaxed"
                >
                  <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-2"></span>
                  <span>{bullet.replace(/^[-•]\s*/, "")}</span>
                </li>
              ))}
            </ul>
          );
        }

        // Check if it's a numbered list
        if (/^\d+\./.test(paragraph.trim())) {
          const items = paragraph.split("\n").filter((line) => line.trim());
          return (
            <ol key={idx} className="space-y-3 ml-4 list-decimal">
              {items.map((item, iIdx) => (
                <li key={iIdx} className="text-gray-800 leading-relaxed ml-4">
                  {item.replace(/^\d+\.\s*/, "")}
                </li>
              ))}
            </ol>
          );
        }

        // Regular paragraph
        return (
          <p key={idx} className="text-gray-800 leading-relaxed text-base">
            {paragraph}
          </p>
        );
      })}
    </div>
  );
}
