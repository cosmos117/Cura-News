import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Article from "./pages/Article";
import NotFound from "./pages/NotFound";
import "./index.css";

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
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <FullPageSpinner />;
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}

function HomeRedirect() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <FullPageSpinner />;
  }

  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
}

function AppRoutes() {
  return (
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

      <Route path="/" element={<HomeRedirect />} />
      {/* Real 404 instead of silently redirecting a mistyped URL */}
      <Route path="*" element={<NotFound />} />
    </Routes>
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