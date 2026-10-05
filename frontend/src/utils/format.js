/**
 * Presentation helpers.
 *
 * Every function here tolerates a missing/invalid input and returns a
 * fallback. The previous `formatTime(undefined)` produced "NaNd ago" on the
 * dashboard because it assumed a well-formed timestamp.
 */

/**
 * Relative time, e.g. "5m ago", "3h ago", "2d ago".
 * @param {string|Date} value - ISO date string or Date
 * @returns {string} - Formatted relative time, or "" when unparseable
 */
export const formatRelativeTime = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();

  // Clock skew / future timestamps (upstream feeds are not always precise)
  if (diffMs < 0) return "just now";

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return formatDate(value);
};

/**
 * Absolute date, e.g. "17 March 2026".
 * @param {string|Date} value - ISO date string or Date
 * @returns {string} - Formatted date, or "" when unparseable
 */
export const formatDate = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

/**
 * Today's date for the dashboard header.
 * @returns {string} - e.g. "1 October 2026"
 */
export const formatToday = () =>
  new Date().toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/**
 * Extract an error message from an axios rejection.
 *
 * A network-level failure (backend down, wrong base URL, CORS block) produces
 * no `response` at all. Falling back to a generic string there is misleading:
 * "Registration failed" reads as a rejected account rather than an
 * unreachable server, which sends people debugging the wrong thing. An axios
 * network error still carries `request`, which is what distinguishes it from a
 * genuine bug thrown inside our own code.
 *
 * @param {Error} error - The caught error
 * @param {string} fallback - Message to use when none can be derived
 * @returns {string} - A user-facing message
 */
export const getErrorMessage = (error, fallback = "Something went wrong") => {
  if (!error?.response) {
    if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
      return "The server took too long to respond. Please try again.";
    }
    if (error?.request) {
      return "Cannot reach the server. Check that the backend is running.";
    }
    return error?.message || fallback;
  }

  return error.response.data?.message || fallback;
};