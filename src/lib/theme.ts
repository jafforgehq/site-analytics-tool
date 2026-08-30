import { useSyncExternalStore } from "react";

const STORAGE_KEY = "site-analytics-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export type ThemePreference = "light" | "dark" | "system";

/**
 * Theme state lives in a module-level store instead of a React provider so it
 * also works on the public /demo routes, which intentionally skip
 * AppProviders. The inline script in index.html applies the stored preference
 * before first paint; this store keeps it in sync afterwards.
 */
let preference: ThemePreference = readStoredPreference();
const listeners = new Set<() => void>();

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(DARK_QUERY).matches
  );
}

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

function applyTheme() {
  document.documentElement.classList.toggle(
    "dark",
    resolveTheme(preference) === "dark",
  );
}

function notify() {
  for (const listener of listeners) listener();
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  if (next === "system") {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  applyTheme();
  notify();
}

/** light → dark → system → light … */
export function nextThemePreference(pref: ThemePreference): ThemePreference {
  if (pref === "light") return "dark";
  if (pref === "dark") return "system";
  return "light";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  // Follow OS-level changes while in system mode.
  window.matchMedia(DARK_QUERY).addEventListener("change", () => {
    if (preference === "system") {
      applyTheme();
      notify();
    }
  });
  applyTheme();
}

export function useTheme() {
  const current = useSyncExternalStore(
    subscribe,
    () => preference,
    (): ThemePreference => "system",
  );
  return {
    preference: current,
    resolved: resolveTheme(current),
    setPreference: setThemePreference,
    cycle: () => setThemePreference(nextThemePreference(current)),
  };
}
