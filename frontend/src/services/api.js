import apiClient from "./apiClient";

// Auth API calls
export const authAPI = {
  register: (data) => apiClient.post("/auth/register", data),
  login: (data) => apiClient.post("/auth/login", data),
  logout: () => apiClient.post("/auth/logout"),
  getCurrentUser: () => apiClient.get("/auth/me"),
};

// News API calls
export const newsAPI = {
  getAll: (params) => apiClient.get("/news", { params }),
  getById: (id) => apiClient.get(`/news/${id}`),
  getSummary: (id) => apiClient.get(`/news/${id}/summary`),
  create: (data) => apiClient.post("/news", data),
  update: (id, data) => apiClient.put(`/news/${id}`, data),
  delete: (id) => apiClient.delete(`/news/${id}`),
};

// AI API calls
export const aiAPI = {
  summarize: (data) => apiClient.post("/ai/summarize", data),
  generateSummary: (articleId) =>
    apiClient.post("/ai/generate-summary", { articleId }),
  batchSummarize: (articleIds) =>
    apiClient.post("/ai/batch-summarize", { articleIds }),
};

// Notes API calls
export const notesAPI = {
  getAll: () => apiClient.get("/notes"),
  getById: (id) => apiClient.get(`/notes/${id}`),
  getByArticle: (articleId) => apiClient.get(`/notes/article/${articleId}`),
  create: (data) => apiClient.post("/notes", data),
  update: (id, data) => apiClient.put(`/notes/${id}`, data),
  delete: (id) => apiClient.delete(`/notes/${id}`),
};

// Quiz API calls
export const quizAPI = {
  getQuiz: (articleId) => apiClient.get(`/quiz/${articleId}`),
  submitQuiz: (data) => apiClient.post("/quiz/submit", data),
  getResults: (articleId) => apiClient.get(`/quiz/${articleId}/results`),
};
