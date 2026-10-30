import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/**
 * "Sign in with Google", styled as one of our own buttons.
 *
 * Google's ready-made button renders inside an iframe, so it cannot pick up
 * the app's fonts. Instead this button opens Google's OAuth popup through the
 * Google Identity Services token client. The access token it returns goes to
 * POST /api/auth/google, which checks it was issued to our client ID and
 * returns the app's own JWT, so the rest of the app sees an ordinary session.
 *
 * Renders nothing when VITE_GOOGLE_CLIENT_ID is not set.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GSI_SRC = "https://accounts.google.com/gsi/client";

// Shared across mounts, so navigating Login <-> Signup loads the script once.
let gsiPromise = null;

const loadGsi = () => {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gsiPromise = null;
        reject(new Error("Could not load Google sign-in"));
      };
      document.head.appendChild(script);
    });
  }
  return gsiPromise;
};

/** Google's multicolour "G", per Google's sign-in branding guidelines. */
function GoogleIcon() {
  return (
    <svg className="icon icon--lg" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * @param {Object} props
 * @param {string} [props.label] - button text
 */
export default function GoogleSignInButton({ label = "Sign in with Google" }) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const tokenClientRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Google calls back long after render; the ref always holds the latest
  // handler without re-creating the token client on every render.
  const onTokenRef = useRef(null);
  onTokenRef.current = async (response) => {
    if (response.error || !response.access_token) {
      setPending(false);
      return;
    }
    const result = await loginWithGoogle(response.access_token);
    setPending(false);
    // A Google sign-in that just created the account goes to the picker.
    if (result.success) navigate(result.created ? "/welcome" : "/dashboard", { replace: true });
  };

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let cancelled = false;

    loadGsi()
      .then(() => {
        if (cancelled) return;
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: "openid email profile",
          callback: (response) => onTokenRef.current?.(response),
          // Closing the popup or a blocked popup lands here, not in callback.
          error_callback: () => setPending(false),
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!CLIENT_ID) return null;

  // Must run directly in the click handler: browsers only allow the popup
  // when it is opened from a user gesture.
  const signIn = () => {
    setPending(true);
    tokenClientRef.current.requestAccessToken({ prompt: "select_account" });
  };

  return (
    <>
      {unavailable ? (
        <p className="text-muted text-center">
          Google sign-in is unavailable right now. Use your email instead.
        </p>
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-block btn-google"
          onClick={signIn}
          disabled={!ready || pending}
        >
          {pending ? (
            <Loader className="icon icon--sm spinner spinner--sm" />
          ) : (
            <GoogleIcon />
          )}
          {pending ? "Signing in..." : label}
        </button>
      )}
      <div className="divider">
        <span className="divider__text">or use your email</span>
      </div>
    </>
  );
}
