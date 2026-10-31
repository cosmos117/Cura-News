import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pagination from "./Pagination";
import SourceCards from "./SourceCards";
import TopicCards from "./TopicCards";

describe("Pagination", () => {
  it("reads out the page and the range shown", () => {
    render(<Pagination page={2} pageSize={20} total={45} hasMore onPageChange={() => {}} />);
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
    expect(screen.getByText("Showing 21–40 of 45")).toBeInTheDocument();
  });

  it("disables Previous on the first page and Next on the last", () => {
    render(<Pagination page={1} pageSize={20} total={5} hasMore={false} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
  });

  it("asks for the neighbouring pages", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={20} total={60} hasMore onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Previous/ }));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(onPageChange.mock.calls).toEqual([[1], [3]]);
  });
});

describe("SourceCards", () => {
  it("shows each paper's count and toggles it", async () => {
    const onToggle = vi.fn();
    render(
      <SourceCards
        sources={["The Hindu", "Times of India"]}
        counts={{ "The Hindu": 1, "Times of India": 7 }}
        selected={["Times of India"]}
        onToggle={onToggle}
      />,
    );
    const hindu = screen.getByRole("button", { name: "The Hindu: 1 article" });
    const toi = screen.getByRole("button", { name: "Times of India: 7 articles" });
    expect(hindu).toHaveAttribute("aria-pressed", "false");
    expect(toi).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(hindu);
    expect(onToggle).toHaveBeenCalledWith("The Hindu");
  });
});

describe("TopicCards", () => {
  const renderTopics = (props = {}) => {
    const handlers = { onToggle: vi.fn(), onClear: vi.fn(), onReset: vi.fn() };
    render(
      <TopicCards
        categories={["Sports", "Science & Technology"]}
        counts={{ Sports: 4, "Science & Technology": 0 }}
        selected={[]}
        activeFilterCount={0}
        {...handlers}
        {...props}
      />,
    );
    return handlers;
  };

  it("totals every topic on the All card", () => {
    renderTopics();
    expect(screen.getByRole("button", { name: /All/ })).toHaveTextContent("4");
  });

  it("disables a topic with no articles unless it is selected", () => {
    renderTopics();
    expect(screen.getByRole("button", { name: /Science & Technology/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Sports/ })).toBeEnabled();
  });

  it("keeps a selected empty topic clickable so it can be cleared", () => {
    renderTopics({ selected: ["Science & Technology"], activeFilterCount: 1 });
    expect(screen.getByRole("button", { name: /Science & Technology/ })).toBeEnabled();
  });

  it("toggles topics and offers a reset once filters are active", async () => {
    const { onToggle, onReset } = renderTopics({ selected: ["Sports"], activeFilterCount: 2 });
    await userEvent.click(screen.getByRole("button", { name: /Sports/ }));
    await userEvent.click(screen.getByRole("button", { name: "Reset all (2)" }));
    expect(onToggle).toHaveBeenCalledWith("Sports");
    expect(onReset).toHaveBeenCalled();
  });
});
