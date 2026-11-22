import type { KeyboardEvent } from "react";

/**
 * Keyboard for a tab list (WAI-ARIA tabs): ArrowRight / ArrowLeft move to the next / previous tab (wrapping), Home / End jump to the first / last.
 * The new tab is selected and gets focus. `ids` are the DOM ids of the tab buttons, in order. Used with a roving tabindex (selected tab = 0, others = -1).
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count < 1) return null;
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export function tabKeyHandler<T extends string>(tabs: { value: T; id: string }[], current: T, select: (t: T) => void) {
  return (e: KeyboardEvent) => {
    const next = nextTabIndex(e.key, tabs.findIndex((t) => t.value === current), tabs.length);
    if (next === null) return;
    e.preventDefault();
    select(tabs[next].value);
    document.getElementById(tabs[next].id)?.focus();
  };
}
