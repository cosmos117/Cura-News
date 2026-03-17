import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { newsAPI } from "../services/api";
import {
  Newspaper,
  LogOut,
  Search,
  Filter,
  Loader,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Calendar,
  Tag,
  ChevronRight,
} from "lucide-react";

const CATEGORIES = [
  { value: "all", label: "All News" },
  { value: "technology", label: "Technology" },
  { value: "business", label: "Business" },
  { value: "science", label: "Science" },
  { value: "health", label: "Health" },
  { value: "entertainment", label: "Entertainment" },
  { value: "sports", label: "Sports" },
];

export default function Dashboard() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTags, setSelectedTags] = useState([]); // Multiple tags filter
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("grouped"); // "grid" or "grouped"

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    fetchArticles();
  }, [isAuthenticated, navigate, selectedTags]);

  const fetchArticles = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        limit: 50,
        offset: 0,
      };

      // Add tags parameter if tags are selected
      if (selectedTags.length > 0) {
        params.tags = selectedTags.join(",");
      }

      const response = await newsAPI.getAll(params);
      setArticles(response.data.data || []);
    } catch (err) {
      setError("Failed to fetch articles. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      const matchesSearch =
        article.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory =
        selectedCategory === "all" || article.category === selectedCategory;

      // Match tags - if tags selected, article must have at least one selected tag
      const matchesTags =
        selectedTags.length === 0 ||
        (article.tags &&
          article.tags.some((tag) => selectedTags.includes(tag)));

      return matchesSearch && matchesCategory && matchesTags;
    });
  }, [articles, searchTerm, selectedCategory, selectedTags]);

  // Group articles by source
  const groupedBySource = useMemo(() => {
    const groups = {};
    filteredArticles.forEach((article) => {
      const source = article.source || "Unknown Source";
      if (!groups[source]) {
        groups[source] = [];
      }
      groups[source].push(article);
    });
    return groups;
  }, [filteredArticles]);

  // Extract all unique tags from articles for filter options
  const allTags = useMemo(() => {
    const tagsSet = new Set();
    articles.forEach((article) => {
      if (article.tags && Array.isArray(article.tags)) {
        article.tags.forEach((tag) => tagsSet.add(tag));
      }
    });
    return Array.from(tagsSet).sort();
  }, [articles]);

  // Get today's articles
  const getTodayDate = () => {
    const today = new Date();
    return today.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap md:flex-nowrap">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-2 rounded-lg shadow-md">
                <Newspaper className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">CURA News</h1>
                <p className="text-xs text-gray-600">{getTodayDate()}</p>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode("grouped")}
                className={`px-3 py-1 rounded transition ${
                  viewMode === "grouped"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                By Source
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`px-3 py-1 rounded transition ${
                  viewMode === "grid"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Grid
              </button>
            </div>

            {/* User Menu */}
            <div className="flex items-center gap-3">
              <button
                onClick={fetchArticles}
                disabled={loading}
                className="p-2 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
                title="Refresh articles"
              >
                <RefreshCw
                  className={`w-5 h-5 text-gray-600 ${loading ? "animate-spin" : ""}`}
                />
              </button>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {user?.fullName || "User"}
                </p>
                <p className="text-xs text-gray-600">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-3 sm:px-4 py-2 rounded-lg flex items-center gap-2 transition shadow-md hover:shadow-lg"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by title or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition shadow-sm"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="w-5 h-5 text-gray-600" />
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`px-4 py-2 rounded-full transition font-medium text-sm ${
                    selectedCategory === cat.value
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-white text-gray-700 border border-gray-300 hover:border-blue-600"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tag Filter */}
          {allTags.length > 0 && (
            <div className="flex items-start gap-3 flex-wrap">
              <Tag className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
              <div className="flex gap-2 flex-wrap">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setSelectedTags((prev) =>
                        prev.includes(tag)
                          ? prev.filter((t) => t !== tag)
                          : [...prev, tag],
                      );
                    }}
                    className={`px-3 py-1.5 rounded-full transition font-medium text-sm flex items-center gap-1 ${
                      selectedTags.includes(tag)
                        ? "bg-purple-600 text-white shadow-md"
                        : "bg-white text-gray-700 border border-gray-300 hover:border-purple-400"
                    }`}
                  >
                    {tag}
                    {selectedTags.includes(tag) && (
                      <span className="ml-1 font-bold">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results Info and Clear Filters */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">
                {filteredArticles.length}
              </span>{" "}
              articles found
              {selectedTags.length > 0 && (
                <span className="ml-2 text-purple-600 font-medium">
                  (Tags: {selectedTags.join(", ")})
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="text-sm text-gray-600 hover:text-gray-900 underline font-medium"
                >
                  Clear Tags
                </button>
              )}
              {(selectedCategory !== "all" || selectedTags.length > 0) && (
                <button
                  onClick={() => {
                    setSelectedCategory("all");
                    setSelectedTags([]);
                    setSearchTerm("");
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900 underline font-medium"
                >
                  Reset All
                </button>
              )}
              <div className="text-xs text-gray-500">
                {viewMode === "grouped"
                  ? `${Object.keys(groupedBySource).length} sources`
                  : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-600">Loading today's news...</p>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-lg border border-gray-200">
            <Newspaper className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg mb-2">No articles found</p>
            <p className="text-gray-500 text-sm">
              Try adjusting your search or filters
            </p>
          </div>
        ) : viewMode === "grouped" ? (
          // Grouped by Source View
          <div className="space-y-8">
            {Object.entries(groupedBySource).map(([source, sourceArticles]) => (
              <div key={source} className="space-y-4">
                {/* Source Header */}
                <div className="flex items-center gap-3">
                  <div className="w-1 h-8 bg-gradient-to-b from-blue-600 to-blue-400 rounded-full"></div>
                  <h2 className="text-xl font-bold text-gray-900">{source}</h2>
                  <span className="ml-auto text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                    {sourceArticles.length} articles
                  </span>
                </div>

                {/* Articles Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sourceArticles.map((article) => (
                    <ArticleCard
                      key={article._id}
                      article={article}
                      onClick={() => navigate(`/article/${article._id}`)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Grid View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredArticles.map((article) => (
              <ArticleCard
                key={article._id}
                article={article}
                onClick={() => navigate(`/article/${article._id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// Article Card Component
function ArticleCard({ article, onClick }) {
  const formatTime = (date) => {
    const now = new Date();
    const articleDate = new Date(date);
    const diffMs = now - articleDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getCategoryColor = (category) => {
    const colors = {
      technology: "bg-blue-100 text-blue-800",
      business: "bg-purple-100 text-purple-800",
      science: "bg-green-100 text-green-800",
      health: "bg-red-100 text-red-800",
      entertainment: "bg-pink-100 text-pink-800",
      sports: "bg-orange-100 text-orange-800",
    };
    return colors[category] || "bg-gray-100 text-gray-800";
  };

  return (
    <article
      onClick={onClick}
      className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden group border border-gray-200 hover:border-blue-300 flex flex-col h-full"
    >
      {/* Image Container */}
      {article.imageUrl && (
        <div className="relative w-full h-48 overflow-hidden bg-gray-200">
          <img
            src={article.imageUrl}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </div>
      )}

      {/* Card Content */}
      <div className="p-5 flex flex-col flex-1">
        {/* Header with Category and Time */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full flex-shrink-0 ${getCategoryColor(
              article.category,
            )}`}
          >
            {article.category || "News"}
          </span>
          <span className="text-xs text-gray-500 flex items-center gap-1 flex-shrink-0">
            <Calendar className="w-3 h-3" />
            {formatTime(article.publishedAt)}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-bold text-gray-900 line-clamp-3 mb-3 group-hover:text-blue-600 transition">
          {article.title}
        </h3>

        {/* Description/Summary */}
        <p className="text-sm text-gray-600 line-clamp-3 mb-4 flex-grow">
          {article.description || article.content || "No description available"}
        </p>

        {/* Source and Arrow */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-gray-700">
              {article.source || "News"}
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
        </div>

        {/* Tags */}
        {article.tags && article.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {article.tags.slice(0, 3).map((tag, idx) => (
              <span
                key={idx}
                className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded flex items-center gap-1"
              >
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
