import apiClient from "./apiClient";

/**
 * API client wrappers.
 *
 * Only endpoints that actually exist on the backend are declared here.
 * Previously ~half of these pointed at routes that were never implemented
 * (GET /news/:id/summary, PUT|DELETE /news/:id, POST /ai/generate-summary,
 * GET /quiz/:id/results, GET /notes/:id) and silently 404'd at runtime.
 */

// Auth API calls
export const authAPI = {
  register: (data) => apiClient.post("/auth/register", data),
  login: (data) => apiClient.post("/auth/login", data),
  logout: () => apiClient.post("/auth/logout"),
  getCurrentUser: () => apiClient.get("/auth/me"),
};

// News API calls
export const newsAPI = {
  // Alias for GET /news/today. Supports limit, skip, tag, tags, source.
  getAll: (params) => apiClient.get("/news", { params }),
  getById: (id) => apiClient.get(`/news/${id}`),
  generateDetailed: (id) =>
    apiClient.post(`/news/${id}/detailed`, null, { timeout: 90000 }),
  getByTag: (tag, params) => apiClient.get(`/news/tag/${tag}`, { params }),
  getBySource: (source, params) =>
    apiClient.get(`/news/source/${encodeURIComponent(source)}`, { params }),
  search: (q, params) => apiClient.get("/news/search", { params: { q, ...params } }),
  getStats: () => apiClient.get("/news/stats/overview"),
  // Requires authentication; runs the ingest pipeline in the background.
  fetchDaily: (params) => apiClient.get("/news/fetch-daily", { params }),
  create: (data) => apiClient.post("/news", data),
};

// AI API calls. All require authentication and are rate limited, because each
// call bills a real OpenAI request.
export const aiAPI = {
  summarize: (data) => apiClient.post("/ai/summarize", data),
  // Body key is `articles` (an array of article TEXTS), not `articleIds`.
  batchSummarize: (articles) =>
    apiClient.post("/ai/batch-summarize", { articles }),
  quickAnalyze: (articlePreview) =>
    apiClient.post("/ai/quick-analyze", { articlePreview }),
  health: () => apiClient.get("/ai/health"),
};

// Notes API calls
export const notesAPI = {
  // The signed-in user's own notes (protected).
  getAll: (params) => apiClient.get("/notes", { params }),
  // Public per-article feed. Returns EVERY user's note with only the author
  // name - never treat this as the current user's notes.
  getByArticle: (articleId, params) =>
    apiClient.get(`/notes/article/${articleId}`, { params }),
  getById: (id) => apiClient.get(`/notes/note/${id}`),
  create: (data) => apiClient.post("/notes", data),
  update: (id, data) => apiClient.put(`/notes/${id}`, data),
  delete: (id) => apiClient.delete(`/notes/${id}`),
  togglePin: (id) => apiClient.patch(`/notes/${id}/pin`),
  getStats: () => apiClient.get("/notes/stats/overview"),
};

// Quiz API calls.
// There is deliberately no endpoint that returns the answer key: the backend
// removed GET /quiz/:id/answers and GET /news/:id?includeAnswers=true, both of
// which leaked every correct answer to anonymous callers.
export const quizAPI = {
  getQuiz: (articleId) => apiClient.get(`/quiz/${articleId}`),
  submitQuiz: (data) => apiClient.post("/quiz/submit", data),
  getStats: (articleId) => apiClient.get(`/quiz/stats/${articleId}`),
};