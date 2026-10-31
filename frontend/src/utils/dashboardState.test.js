import { describe, expect, it } from "vitest";
import {
  getSavedPage,
  getSavedString,
  getSavedViewMode,
  pageRange,
  readDashboardState,
  saveDashboardState,
} from "./dashboardState";
import { readFeedMode, saveFeedMode } from "./feedMode";

describe("dashboard state", () => {
  it("round-trips through sessionStorage", () => {
    saveDashboardState({ page: 3, viewMode: "cards" });
    expect(readDashboardState()).toEqual({ page: 3, viewMode: "cards" });
  });

  it("reads missing or corrupt state as empty", () => {
    expect(readDashboardState()).toEqual({});
    sessionStorage.setItem("curaDashboardState", "{not json");
    expect(readDashboardState()).toEqual({});
    sessionStorage.setItem("curaDashboardState", "42");
    expect(readDashboardState()).toEqual({});
  });

  it("sanitises saved values", () => {
    expect(getSavedPage("4")).toBe(4);
    expect(getSavedPage("0")).toBe(1);
    expect(getSavedPage(undefined)).toBe(1);
    expect(getSavedViewMode("cards")).toBe("cards");
    expect(getSavedViewMode("grid")).toBe("line");
    expect(getSavedString("india")).toBe("india");
    expect(getSavedString(7)).toBe("");
  });
});

describe("pageRange", () => {
  it("describes an empty result", () => {
    expect(pageRange(0, 1, 20)).toEqual({ totalPages: 1, first: 0, last: 0 });
  });

  it("describes a full page and a partial last page", () => {
    expect(pageRange(93, 1, 20)).toEqual({ totalPages: 5, first: 1, last: 20 });
    expect(pageRange(93, 5, 20)).toEqual({ totalPages: 5, first: 81, last: 93 });
  });

  it("never reads past the total when the page is stale", () => {
    expect(pageRange(10, 3, 20)).toEqual({ totalPages: 1, first: 10, last: 10 });
  });
});

describe("feed mode", () => {
  it("remembers only known modes", () => {
    expect(readFeedMode()).toBeNull();
    saveFeedMode("latest");
    expect(readFeedMode()).toBe("latest");
    localStorage.setItem("curaFeedMode", "trending");
    expect(readFeedMode()).toBeNull();
  });
});
