import apiClient from "./apiClient";

/**
 * API client wrappers.
 *
 * Only the endpoints the app actually calls are declared here.
 */

// Auth API calls
export const authAPI = {
  register: (data) => apiClient.post("/auth/register", data),
  login: (data) => apiClient.post("/auth/login", data),
  // `accessToken` comes from the Google sign-in popup (GIS token client).
  google: (accessToken) => apiClient.post("/auth/google", { accessToken }),
  logout: () => apiClient.post("/auth/logout"),
  getCurrentUser: () => apiClient.get("/auth/me"),
};

// News API calls
export const newsAPI = {
  // Alias for GET /news/today. Supports limit, skip, tag, tags, source.
  getAll: (params) => apiClient.get("/news", { params }),
  // Same params as getAll, bounded by the reader's picks. 409 until they pick.
  getForYou: (params) => apiClient.get("/news/for-you", { params }),
  getById: (id) => apiClient.get(`/news/${id}`),
  generateDetailed: (id) =>
    // Express's strict JSON parser rejects a primitive `null` body. The
    // detailed endpoint needs no input, so send an empty JSON object instead.
    apiClient.post(`/news/${id}/detailed`, {}, { timeout: 90000 }),
};

// The signed-in reader's own account.
export const meAPI = {
  savePreferences: (preferences) => apiClient.put("/me/preferences", preferences),
  skipOnboarding: () => apiClient.post("/me/onboarding/skip"),
  // Body { confirm: "DELETE" }, sent once the reader confirms in the dialog.
  deleteAccount: (body) => apiClient.delete("/me", { data: body }),
};

// Public usage totals for the landing page.
export const statsAPI = {
  get: () => apiClient.get("/stats"),
};

export const bookmarkAPI = {
  getAll: (params) => apiClient.get("/bookmarks", { params }),
  // The saved copy of an article; still readable after the article is deleted.
  getOne: (articleId) => apiClient.get(`/bookmarks/${articleId}`),
  getStatus: (articleId) => apiClient.get(`/bookmarks/${articleId}/status`),
  save: (articleId) => apiClient.post(`/bookmarks/${articleId}`),
  remove: (articleId) => apiClient.delete(`/bookmarks/${articleId}`),
};
