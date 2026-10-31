/**
 * Dashboard view state (search, filters, view mode, page, scroll position),
 * kept in sessionStorage so returning from an article restores the list.
 */
const DASHBOARD_STATE_KEY = "curaDashboardState";

export const readDashboardState = () => {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_STATE_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw);
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
};

export const saveDashboardState = (state) => {
  try {
    sessionStorage.setItem(DASHBOARD_STATE_KEY, JSON.stringify(state));
  } catch {
    // Session storage may be unavailable in restricted browser contexts.
  }
};

export const getSavedPage = (value) => {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
};

export const getSavedViewMode = (value) => (value === "cards" ? "cards" : "line");

export const getSavedString = (value) => (typeof value === "string" ? value : "");

/**
 * Pagination readouts. `total` is the size of the filtered result set, not
 * the size of the current page, so the range is derived from the offset.
 * @returns {{ totalPages: number, first: number, last: number }}
 */
export const pageRange = (total, page, pageSize) => ({
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
  first: total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total),
  last: total === 0 ? 0 : Math.min(page * pageSize, total),
});
