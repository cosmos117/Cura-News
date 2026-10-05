import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  User,
  AlertCircle,
  Loader,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const MIN_PASSWORD_LENGTH = 8;

export default function Signup() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState("");
  const { register, loading, error: authError, clearError } = useAuth();
  const navigate = useNavigate();

  const passwordsMatch =
    confirmPassword.length === 0 || password === confirmPassword;
  const passwordTooShort =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");
    clearError();

    if (!fullName.trim()) {
      setLocalError("Please enter your full name.");
      return;
    }
    if (!email.trim()) {
      setLocalError("Please enter your email.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }

    // Passwords are NOT trimmed: leading/trailing spaces are valid characters
    // and silently altering a secret the user chose is wrong.
    const result = await register(
      email.trim(),
      password,
      confirmPassword,
      fullName.trim(),
    );

    if (result.success) {
      navigate("/dashboard", { replace: true });
    }
  };

  const displayedError = authError || localError;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__header">
          <h1 className="auth-card__title">CURA News</h1>
          <p className="auth-card__subtitle">Create your account</p>
        </div>

        {displayedError && (
          <div className="alert alert--error" role="alert">
            <AlertCircle className="icon icon--lg" />
            <p className="alert-body">{displayedError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form" noValidate>
          <div>
            <label className="label" htmlFor="fullName">
              Full Name
            </label>
            <div className="field field--icon">
              <User className="field-icon icon icon--lg" />
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                autoComplete="name"
                className="input"
                required
              />
            </div>
          </div>

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
                autoComplete="new-password"
                aria-describedby="password-hint"
                className={`input input--trailing${
                  passwordTooShort ? " input--error" : ""
                }`}
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
            <p
              id="password-hint"
              className={`field-hint${
                passwordTooShort ? " field-hint--error" : ""
              }`}
            >
              At least {MIN_PASSWORD_LENGTH} characters
            </p>
          </div>

          <div>
            <label className="label" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <div className="field field--icon">
              <Lock className="field-icon icon icon--lg" />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className={`input input--trailing${
                  passwordsMatch ? "" : " input--error"
                }`}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={
                  showConfirmPassword
                    ? "Hide password confirmation"
                    : "Show password confirmation"
                }
                className="field-toggle"
              >
                {showConfirmPassword ? (
                  <EyeOff className="icon icon--lg" />
                ) : (
                  <Eye className="icon icon--lg" />
                )}
              </button>
            </div>
            {!passwordsMatch && (
              <p className="field-hint field-hint--error">
                Passwords do not match
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !passwordsMatch}
            className="btn btn-primary btn-block"
          >
            {loading ? (
              <>
                <Loader className="icon icon--sm spinner spinner--sm" />
                Creating account...
              </>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <div className="divider">
          <span className="divider__text">Already have an account?</span>
        </div>

        <Link to="/login" className="btn btn-secondary btn-block">
          Sign In
        </Link>

        <p className="auth-footer">
          By creating an account, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
}