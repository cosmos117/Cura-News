import { useEffect } from "react";

/**
 * Call `refresh` every `intervalMs` while `enabled`, so articles ingested by
 * the backend scheduler appear without a manual reload. Paused while the tab
 * is hidden: a background tab polling is pure waste, and returning to the tab
 * triggers an immediate catch-up refresh.
 *
 * Only schedules later polls; the initial load is the caller's job, so
 * mounting never fires a duplicate request.
 */
export default function useFeedPolling(refresh, intervalMs, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    let refreshTimer = null;

    const poll = () => {
      refresh();
      refreshTimer = setTimeout(poll, intervalMs);
    };

    const startPolling = () => {
      if (refreshTimer === null) {
        refreshTimer = setTimeout(poll, intervalMs);
      }
    };

    const stopPolling = () => {
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        refresh();
        startPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    if (!document.hidden) startPolling();

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh, intervalMs, enabled]);
}
