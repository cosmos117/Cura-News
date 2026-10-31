import { lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Landing from "./pages/Landing";

const RELOADED_KEY = "curaChunkReload";

/**
 * Load a page's code only when it is first opened. After a deploy, a tab
 * opened earlier can ask for a file that no longer exists; reload once to pick
 * up the new build instead of showing an error.
 */
const lazyPage = (load) =>
  lazy(() =>
    load()
      .then((module) => {
        sessionStorage.removeItem(RELOADED_KEY);
        return module;
      })
      .catch((error) => {
        if (!sessionStorage.getItem(RELOADED_KEY)) {
          sessionStorage.setItem(RELOADED_KEY, "1");
          window.location.reload();
          return new Promise(() => {});
        }
        throw error;
      }),
  );

const Login = lazyPage(() => import("./pages/Login"));
const Signup = lazyPage(() => import("./pages/Signup"));
const Dashboard = lazyPage(() => import("./pages/Dashboard"));
const Article = lazyPage(() => import("./pages/Article"));
const NotFound = lazyPage(() => import("./pages/NotFound"));
const Bookmarks = lazyPage(() => import("./pages/Bookmarks"));
const Onboarding = lazyPage(() => import("./pages/Onboarding"));
const Settings = lazyPage(() => import("./pages/Settings"));

const FullPageSpinner = ({ label = "Loading..." }) => (
  <div className="page page--centered">
    <div className="text-center">
      <div className="spinner spinner--xl" />
      <p className="loading-caption">{label}</p>
    </div>
  </div>
);

/**
 * Requires an authenticated session.
 *
 * `loading` starts true whenever a token is stored, so the first render waits
 * for the session check instead of immediately mounting a redirect.
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <FullPageSpinner />;
  }

  return isAuthenticated ? (
    children
  ) : (
    <Navigate to="/login" replace state={{ from: window.location.pathname }} />
  );
}

/**
 * For login/signup only: sends an already-authenticated user to the dashboard
 * instead of showing the login form again.
 */
function PublicOnlyRoute({ children }) {
  const { isAuthenticated, isNewAccount, loading } = useAuth();

  if (loading) {
    return <FullPageSpinner />;
  }

  // A brand-new account goes on to pick its sources and topics first.
  return isAuthenticated ? (
    <Navigate to={isNewAccount ? "/welcome" : "/dashboard"} replace />
  ) : (
    children
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnlyRoute>
              <Signup />
            </PublicOnlyRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/article/:id"
          element={
            <ProtectedRoute>
              <Article />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookmarks"
          element={
            <ProtectedRoute>
              <Bookmarks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/welcome"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />

        <Route path="/" element={<Landing />} />
        {/* Real 404 instead of silently redirecting a mistyped URL */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}