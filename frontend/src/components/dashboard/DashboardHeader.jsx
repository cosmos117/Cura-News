import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  LayoutGrid,
  LayoutList,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
} from "lucide-react";
import WeatherWidget from "../WeatherWidget";
import useHideOnScroll from "../../hooks/useHideOnScroll";
import { formatToday } from "../../utils/format";

const VIEW_MODES = [
  {
    value: "line",
    label: "Line",
    Icon: LayoutList,
    title: "Line view: one article per row, grouped by source",
  },
  {
    value: "cards",
    label: "Cards",
    Icon: LayoutGrid,
    title: "Card view: two articles per row",
  },
];

/** Dashboard header: weather, brand, view mode, and account actions. */
export default function DashboardHeader({
  user,
  viewMode,
  onViewModeChange,
  onRefresh,
  refreshing,
  onLogout,
}) {
  const navigate = useNavigate();
  const hidden = useHideOnScroll();

  return (
    <header className={`site-header site-header--autohide${hidden ? " site-header--hidden" : ""}`}>
      <div className="container site-header__inner">
        <div className="header__left">
          <WeatherWidget />

          <div className="brand">
            <div className="brand__mark">
              <img src="/logo.svg" alt="" width="40" height="40" />
            </div>
            <div>
              <h1 className="brand__name">CURA News</h1>
              <p className="brand__date">{formatToday()}</p>
            </div>
          </div>
        </div>

        <div className="segmented" role="group" aria-label="View mode">
          {VIEW_MODES.map(({ value, label, Icon, title }) => (
            <button
              key={value}
              type="button"
              onClick={() => onViewModeChange(value)}
              aria-pressed={viewMode === value}
              title={title}
              className={`segmented__option${
                viewMode === value ? " segmented__option--active" : ""
              }`}
            >
              <Icon className="icon icon--sm" />
              <span className="segmented__label">{label}</span>
            </button>
          ))}
        </div>

        <div className="row row-3">
          <button
            onClick={() => navigate("/bookmarks")}
            className="btn btn-secondary btn-sm"
            title="View saved articles"
          >
            <Bookmark className="icon icon--md" />
            <span className="btn__label">Saved</span>
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="icon-btn"
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon className="icon icon--lg" />
          </button>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="icon-btn"
            title="Refresh articles"
            aria-label="Refresh articles"
          >
            <RefreshCw
              className={`icon icon--lg${refreshing ? " spinner spinner--sm" : ""}`}
            />
          </button>

          <div className="user-chip">
            <p className="user-chip__name">{user?.name || "User"}</p>
            <p className="user-chip__email">{user?.email}</p>
          </div>

          <button onClick={onLogout} className="btn btn-danger btn-sm">
            <LogOut className="icon icon--md" />
            <span className="btn__label">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
