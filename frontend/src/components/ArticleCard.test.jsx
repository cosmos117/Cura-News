import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArticleCard from "./ArticleCard";
import DetailedBadge from "./DetailedBadge";

const article = {
  _id: "a1",
  headline: "Parliament passes the data protection bill",
  summary: "The bill sets new rules for personal data.",
  bulletPoints: ["Fines up to Rs 250 crore", "A new data board", "Third point is hidden"],
  category: "Politics & Governance",
  source: "The Hindu",
  date: new Date().toISOString(),
  url: "https://example.com/story",
  detailedStatus: "DONE",
};

describe("ArticleCard", () => {
  it("shows the headline, summary, topic and the first two points", () => {
    render(<ArticleCard article={article} onClick={() => {}} />);
    expect(screen.getByText(article.headline)).toBeInTheDocument();
    expect(screen.getByText(article.summary)).toBeInTheDocument();
    expect(screen.getByText("Politics & Governance")).toBeInTheDocument();
    expect(screen.getByText("A new data board")).toBeInTheDocument();
    expect(screen.queryByText("Third point is hidden")).not.toBeInTheDocument();
    expect(screen.getByText("Detailed")).toBeInTheDocument();
  });

  it("opens on click and on Enter or Space", async () => {
    const onClick = vi.fn();
    render(<ArticleCard article={article} onClick={onClick} />);
    const card = screen.getByRole("button", { name: /Read article/ });

    await userEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    fireEvent.keyDown(card, { key: "a" });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it("follows the original link without opening the card", async () => {
    const onClick = vi.fn();
    render(<ArticleCard article={article} onClick={onClick} />);
    const link = screen.getByRole("link", { name: /Read original/ });
    expect(link).toHaveAttribute("href", article.url);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    await userEvent.click(link);
    fireEvent.keyDown(link, { key: "Enter" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("falls back gracefully on a sparse article", () => {
    render(<ArticleCard article={{ _id: "a2", headline: "Bare" }} onClick={() => {}} />);
    expect(screen.getByText("No summary available")).toBeInTheDocument();
    expect(screen.getByText("Misc")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("DetailedBadge", () => {
  it("shows only once the detailed summary is done", () => {
    const { rerender } = render(<DetailedBadge status="PENDING" />);
    expect(screen.queryByText("Detailed")).not.toBeInTheDocument();
    rerender(<DetailedBadge status="DONE" />);
    expect(screen.getByText("Detailed")).toBeInTheDocument();
  });
});
