import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatExpiry, formatRelativeTime, getErrorMessage } from "./format";

const NOW = new Date("2026-10-31T12:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const MINUTE = 60_000;

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("returns an empty string for missing or invalid dates", () => {
    expect(formatRelativeTime(undefined)).toBe("");
    expect(formatRelativeTime("not a date")).toBe("");
  });

  it("treats future timestamps and the last minute as just now", () => {
    expect(formatRelativeTime(ago(-5 * MINUTE))).toBe("just now");
    expect(formatRelativeTime(ago(30_000))).toBe("just now");
  });

  it("counts minutes, hours and days", () => {
    expect(formatRelativeTime(ago(5 * MINUTE))).toBe("5m ago");
    expect(formatRelativeTime(ago(3 * 60 * MINUTE))).toBe("3h ago");
    expect(formatRelativeTime(ago(2 * 24 * 60 * MINUTE))).toBe("2d ago");
  });

  it("falls back to a full date after a month", () => {
    expect(formatRelativeTime("2026-08-01T12:00:00Z")).toBe("1 August 2026");
  });
});

describe("formatExpiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("shows minutes under an hour and whole hours above", () => {
    expect(formatExpiry(ago(-12 * MINUTE))).toBe("Expires in 12m");
    expect(formatExpiry(ago(-(5 * 60 + 30) * MINUTE))).toBe("Expires in 5h");
  });

  it("reports a past time as expired and ignores bad input", () => {
    expect(formatExpiry(ago(MINUTE))).toBe("Expired");
    expect(formatExpiry(null)).toBe("");
    expect(formatExpiry("nope")).toBe("");
  });
});

describe("getErrorMessage", () => {
  it("prefers the server's message", () => {
    expect(getErrorMessage({ response: { data: { message: "Email taken" } } })).toBe("Email taken");
  });

  it("uses the fallback when the server sends no message", () => {
    expect(getErrorMessage({ response: { data: {} } }, "Signup failed")).toBe("Signup failed");
  });

  it("names an unreachable server instead of blaming the request", () => {
    expect(getErrorMessage({ request: {} })).toMatch(/Cannot reach the server/);
  });

  it("names a timeout", () => {
    expect(getErrorMessage({ code: "ECONNABORTED", request: {} })).toMatch(/too long/);
  });

  it("passes through errors thrown in our own code", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });
});
