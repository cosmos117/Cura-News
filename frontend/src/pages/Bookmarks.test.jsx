import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import Bookmarks from "./Bookmarks";
import { bookmarkAPI } from "../services/api";

vi.mock("../services/api", () => ({ bookmarkAPI: { getAll: vi.fn(), remove: vi.fn() } }));

const DAY = 24 * 60 * 60 * 1000;
const saved = {
  _id: "b1",
  headline: "Total construction ban in Delhi-NCR",
  summary: "Construction stops across the region from Nov 5 to 20.",
  source: "Times of India",
  category: "Environment & Climate",
  date: new Date().toISOString(),
  url: "https://example.com/ban",
  expiresAt: new Date(Date.now() + 29.5 * DAY).toISOString(),
  archived: true,
};

function ArticleStub() {
  return <p>Opened article {useParams().id}</p>;
}

const renderSaved = () =>
  render(
    <MemoryRouter
      initialEntries={["/bookmarks"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/article/:id" element={<ArticleStub />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  bookmarkAPI.getAll.mockResolvedValue({
    data: { data: [saved], pagination: { total: 1, hasMore: false } },
  });
  bookmarkAPI.remove.mockResolvedValue({ data: { success: true } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Saved articles", () => {
  it("shows each saved story as a full article card with its expiry", async () => {
    renderSaved();
    expect(await screen.findByText(saved.headline)).toBeInTheDocument();
    expect(screen.getByText(saved.summary)).toBeInTheDocument();
    expect(screen.getByText(/Expires in 29 days/)).toBeInTheDocument();
    expect(screen.getByText(/kept for 30 days/)).toBeInTheDocument();
  });

  it("opens the story when the card is clicked, like the dashboard", async () => {
    renderSaved();
    await userEvent.click(await screen.findByRole("button", { name: /Read article/ }));
    expect(screen.getByText("Opened article b1")).toBeInTheDocument();
  });

  it("opens the story from the keyboard", async () => {
    renderSaved();
    fireEvent.keyDown(await screen.findByRole("button", { name: /Read article/ }), { key: "Enter" });
    expect(screen.getByText("Opened article b1")).toBeInTheDocument();
  });

  it("removes a story without opening it", async () => {
    renderSaved();
    const remove = await screen.findByRole("button", { name: /Remove .* from saved articles/ });

    fireEvent.keyDown(remove, { key: "Enter" });
    await userEvent.click(remove);

    expect(bookmarkAPI.remove).toHaveBeenCalledWith("b1");
    await waitFor(() => expect(screen.queryByText(saved.headline)).not.toBeInTheDocument());
    expect(screen.queryByText(/Opened article/)).not.toBeInTheDocument();
  });
});
