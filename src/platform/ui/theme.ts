import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "grounded.theme.v1";
const subscribers = new Set<() => void>();

/** Runs in the document head before the stylesheet, so a stored dark theme paints dark from the first frame. */
export const THEME_SCRIPT = `try {
  var dark = localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  if (dark) document.querySelector('meta[name="theme-color"]').content = "#000000";
} catch (_) {
  document.documentElement.dataset.theme = "light";
}`;

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", getComputedStyle(document.body).backgroundColor);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private windows can refuse storage, and the theme still applies for this page.
  }
  for (const notify of subscribers) {
    notify();
  }
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => "light");
}
