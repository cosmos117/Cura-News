import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Landing from "./Landing";
import { statsAPI } from "../services/api";

vi.mock("../services/api", () => ({ statsAPI: { get: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: false }) }));

const renderLanding = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Landing />
    </MemoryRouter>,
  );

beforeEach(() => {
  statsAPI.get.mockReset();
});

describe("Landing stats", () => {
  it("leads with the live reader count once the server has it", async () => {
    statsAPI.get.mockResolvedValue({ data: { data: { readers: 1250 } } });
    renderLanding();

    expect(await screen.findByText("1,250")).toBeInTheDocument();
    expect(screen.getByText("Readers signed up")).toBeInTheDocument();
    expect(screen.getByText("Trusted publishers")).toBeInTheDocument();
    expect(screen.queryByText("Saved stories kept")).not.toBeInTheDocument();
  });

  it("keeps the fixed facts when there are no readers yet", async () => {
    statsAPI.get.mockResolvedValue({ data: { data: { readers: 0 } } });
    renderLanding();

    await vi.waitFor(() => expect(statsAPI.get).toHaveBeenCalled());
    expect(screen.getByText("Saved stories kept")).toBeInTheDocument();
    expect(screen.queryByText("Readers signed up")).not.toBeInTheDocument();
  });

  it("keeps the fixed facts when the stats request fails", async () => {
    statsAPI.get.mockRejectedValue(new Error("offline"));
    renderLanding();

    await vi.waitFor(() => expect(statsAPI.get).toHaveBeenCalled());
    expect(screen.getByText("Saved stories kept")).toBeInTheDocument();
    expect(screen.queryByText("Readers signed up")).not.toBeInTheDocument();
  });
});
