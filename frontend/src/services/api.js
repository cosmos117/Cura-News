import apiClient from "./apiClient";

/**
 * API client wrappers.
 *
 * Only endpoints that actually exist on the backend are declared here.
 * Previously ~half of these pointed at routes that were never implemented
 * (GET /news/:id/summary, PUT|DELETE /news/:id, POST /ai/generate-summary)
 * and silently 404'd at runtime.
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
    // Express's strict JSON parser rejects a primitive `null` body. The
    // detailed endpoint needs no input, so send an empty JSON object instead.
    apiClient.post(`/news/${id}/detailed`, {}, { timeout: 90000 }),
  getByTag: (tag, params) => apiClient.get(`/news/tag/${tag}`, { params }),
  getBySource: (source, params) =>
    apiClient.get(`/news/source/${encodeURIComponent(source)}`, { params }),
  search: (q, params) => apiClient.get("/news/search", { params: { q, ...params } }),
  getStats: () => apiClient.get("/news/stats/overview"),
  create: (data) => apiClient.post("/news", data),
};

// AI API calls. All require authentication and are rate limited, because each
// call bills a real AI request.
export const aiAPI = {
  summarize: (data) => apiClient.post("/ai/summarize", data),
  // Body key is `articles` (an array of article TEXTS), not `articleIds`.
  batchSummarize: (articles) =>
    apiClient.post("/ai/batch-summarize", { articles }),
  quickAnalyze: (articlePreview) =>
    apiClient.post("/ai/quick-analyze", { articlePreview }),
  health: () => apiClient.get("/ai/health"),
};