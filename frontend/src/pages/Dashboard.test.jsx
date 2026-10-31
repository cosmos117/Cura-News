import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";
import { newsAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";

vi.mock("../services/api", () => ({
  newsAPI: { getAll: vi.fn(), getForYou: vi.fn() },
}));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));

const article = (id, source, headline) => ({
  _id: id,
  source,
  headline,
  summary: `${headline} summary`,
  category: "Sports",
  date: new Date().toISOString(),
});

const feed = (data, total = data.length) => ({
  data: {
    data,
    pagination: { total, hasMore: total > data.length },
    facets: { bySource: { "The Hindu": 1, "Times of India": 1 }, byCategory: { Sports: 2 } },
  },
});

const signIn = (preferences = {}) =>
  useAuth.mockReturnValue({
    user: { name: "Asha", email: "asha@example.com", preferences },
    isAuthenticated: true,
    logout: vi.fn(),
    notice: null,
    clearNotice: vi.fn(),
  });

const renderDashboard = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Dashboard />
    </MemoryRouter>,
  );

beforeEach(() => {
  // The header weather widget calls Open-Meteo.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ current_weather: { temperature: 31, weathercode: 0 } }),
    })),
  );
  newsAPI.getAll.mockResolvedValue(
    feed([
      article("1", "The Hindu", "Hindu story"),
      article("2", "Times of India", "TOI story"),
    ]),
  );
  newsAPI.getForYou.mockResolvedValue(feed([article("3", "The Hindu", "Picked story")]));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Dashboard", () => {
  it("shows the Latest feed grouped by paper for a reader without picks", async () => {
    signIn();
    renderDashboard();

    expect(await screen.findByText("Hindu story")).toBeInTheDocument();
    expect(newsAPI.getAll).toHaveBeenCalledWith({ limit: 20, skip: 0 });
    expect(newsAPI.getForYou).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "The Hindu" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Times of India" })).toBeInTheDocument();
    expect(screen.getByText("Set up For You")).toBeInTheDocument();
  });

  it("opens on For You when the reader has picks, and switches to Latest", async () => {
    signIn({ sources: ["The Hindu"], topics: ["sports"] });
    renderDashboard();

    expect(await screen.findByText("Picked story")).toBeInTheDocument();
    expect(newsAPI.getForYou).toHaveBeenCalledTimes(1);
    // Only the picked paper gets a source card.
    const sources = screen.getByRole("region", { name: "Browse by source" });
    expect(within(sources).getAllByRole("button")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /Latest/ }));
    expect(await screen.findByText("TOI story")).toBeInTheDocument();
    expect(localStorage.getItem("curaFeedMode")).toBe("latest");
  });

  it("sends a search only once it is long enough and typing has paused", async () => {
    signIn();
    renderDashboard();
    await screen.findByText("Hindu story");
    const box = screen.getByRole("textbox", { name: "Search articles" });

    await userEvent.type(box, "ab");
    await new Promise((r) => setTimeout(r, 400));
    expect(newsAPI.getAll).toHaveBeenCalledTimes(1);

    await userEvent.type(box, "c budget");
    await waitFor(() =>
      expect(newsAPI.getAll).toHaveBeenLastCalledWith({ limit: 20, skip: 0, search: "abc budget" }),
    );
    expect(newsAPI.getAll).toHaveBeenCalledTimes(2);
  });

  it("filters by paper on the server and resets to the first page", async () => {
    signIn();
    renderDashboard();
    await screen.findByText("Hindu story");

    await userEvent.click(screen.getByRole("button", { name: /^The Hindu:/ }));
    await waitFor(() =>
      expect(newsAPI.getAll).toHaveBeenLastCalledWith({ limit: 20, skip: 0, source: "The Hindu" }),
    );
  });

  it("shows the server's error when the feed fails to load", async () => {
    signIn();
    newsAPI.getAll.mockRejectedValue({ response: { data: { message: "Database is waking up" } } });
    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent("Database is waking up");
  });
});
