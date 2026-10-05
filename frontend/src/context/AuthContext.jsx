import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { authAPI } from "../services/api";
import { setUnauthorizedHandler, TOKEN_STORAGE_KEY } from "../services/apiClient";
import { getErrorMessage } from "../utils/format";

export const AuthContext = createContext(null);

const readStoredToken = () => localStorage.getItem(TOKEN_STORAGE_KEY);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(readStoredToken);
  // Starts true when a token exists, so ProtectedRoute waits for the session
  // check instead of rendering a redirect on the first frame. With `false`,
  // a hard refresh of /dashboard bounced a valid session to /login.
  const [loading, setLoading] = useState(() => Boolean(readStoredToken()));
  const [error, setError] = useState(null);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authAPI.getCurrentUser();
      setUser(response.data.user);
      setError(null);
    } catch {
      clearSession();
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  // Initialise user on mount / when the token changes
  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    }
  }, [token, fetchCurrentUser]);

  // Let the axios interceptor route 401s through React state instead of a
  // hard page reload.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setError("Your session has expired. Please sign in again.");
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authAPI.login({ email, password });
      const { token: newToken, user: userData } = response.data;

      localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
      setToken(newToken);
      setUser(userData);
      return { success: true };
    } catch (err) {
      const errorMsg = getErrorMessage(err, "Login failed");
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(
    async (email, password, confirmPassword, name) => {
      setLoading(true);
      setError(null);
      try {
        const response = await authAPI.register({
          name,
          email,
          password,
          confirmPassword,
        });

        // The backend already issues a token on register. Use it instead of
        // discarding it and forcing a second login round-trip.
        const { token: newToken, user: userData } = response.data;
        if (newToken) {
          localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
          setToken(newToken);
          setUser(userData);
        }

        return { success: true, message: response.data.message };
      } catch (err) {
        const errorMsg = getErrorMessage(err, "Registration failed");
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    setError(null);
    try {
      await authAPI.logout();
    } catch {
      // The logout endpoint is best-effort; the client must always clear
      // locally regardless of the response.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const clearError = useCallback(() => setError(null), []);

  // Memoised so consumers only re-render when auth state actually changes.
  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      error,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
      clearError,
    }),
    [user, token, loading, error, login, register, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};