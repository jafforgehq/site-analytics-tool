// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

type MediaListener = (event: { matches: boolean }) => void;

function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MediaListener>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_: string, listener: MediaListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: MediaListener) => {
      listeners.delete(listener);
    },
  }));
  return {
    setMatches(next: boolean) {
      matches = next;
      for (const listener of listeners) listener({ matches: next });
    },
  };
}

function stubLocalStorage() {
  // Node 22+ ships a global localStorage stub that shadows jsdom's working
  // implementation, so tests provide their own in-memory version.
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  Object.defineProperty(window, "localStorage", {
    value: localStorage,
    configurable: true,
  });
  return localStorage;
}

async function loadTheme() {
  // The store keeps module-level state, so give each test a fresh copy.
  vi.resetModules();
  return import("@/lib/theme");
}

beforeEach(() => {
  stubLocalStorage();
  document.documentElement.classList.remove("dark");
});

describe("theme store", () => {
  it("defaults to system preference when nothing is stored", async () => {
    stubMatchMedia(true);
    const theme = await loadTheme();
    expect(theme.resolveTheme("system")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applies and persists an explicit preference", async () => {
    stubMatchMedia(false);
    const theme = await loadTheme();
    theme.setThemePreference("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("site-analytics-theme")).toBe("dark");

    theme.setThemePreference("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("site-analytics-theme")).toBe("light");
  });

  it("clears storage when returning to system mode", async () => {
    stubMatchMedia(false);
    const theme = await loadTheme();
    theme.setThemePreference("dark");
    theme.setThemePreference("system");
    expect(window.localStorage.getItem("site-analytics-theme")).toBeNull();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("reads a stored preference at load", async () => {
    stubMatchMedia(false);
    window.localStorage.setItem("site-analytics-theme", "dark");
    await loadTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("follows OS changes only while in system mode", async () => {
    const media = stubMatchMedia(false);
    const theme = await loadTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    media.setMatches(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    theme.setThemePreference("light");
    media.setMatches(false);
    media.setMatches(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("cycles light → dark → system", async () => {
    stubMatchMedia(false);
    const theme = await loadTheme();
    expect(theme.nextThemePreference("light")).toBe("dark");
    expect(theme.nextThemePreference("dark")).toBe("system");
    expect(theme.nextThemePreference("system")).toBe("light");
  });
});
