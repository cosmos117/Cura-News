import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, AlertCircle, Loader, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { login, loading, error, clearError } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(email.trim(), password);
    if (result.success) {
      navigate("/dashboard", { replace: true });
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__header">
          <h1 className="auth-card__title">CURA News</h1>
          <p className="auth-card__subtitle">Sign in to your account</p>
        </div>

        {error && (
          <div className="alert alert--error" role="alert">
            <AlertCircle className="icon icon--lg" />
            <p className="alert-body">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form" onChange={clearError}>
          <div>
            <label className="label" htmlFor="email">
              Email Address
            </label>
            <div className="field field--icon">
              <Mail className="field-icon icon icon--lg" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="input"
                required
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <div className="field field--icon">
              <Lock className="field-icon icon icon--lg" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="input input--trailing"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="field-toggle"
              >
                {showPassword ? (
                  <EyeOff className="icon icon--lg" />
                ) : (
                  <Eye className="icon icon--lg" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-block"
          >
            {loading ? (
              <>
                <Loader className="icon icon--sm spinner spinner--sm" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="divider">
          <span className="divider__text">Don't have an account?</span>
        </div>

        <Link to="/signup" className="btn btn-secondary btn-block">
          Create Account
        </Link>

        <p className="auth-footer">
          By signing in, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
}