import axios from "axios";

export const TOKEN_STORAGE_KEY = "authToken";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor to include auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/**
 * Called when the API rejects our token as expired/invalid.
 *
 * Set by AuthProvider so a 401 clears auth state through React rather than
 * reloading the page. A full `window.location.href` reload discarded all SPA
 * state, dropped the intended deep link (e.g. /article/:id), and fired once
 * per in-flight request when several requests 401'd together.
 */
let onUnauthorized = null;

export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401 && !error.config?.skipAuthRedirect) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      onUnauthorized?.();
    }

    return Promise.reject(error);
  },
);

export default apiClient;