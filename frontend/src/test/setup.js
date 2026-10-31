import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom does not implement scrolling.
Element.prototype.scrollIntoView = vi.fn();
window.scrollTo = vi.fn();

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
