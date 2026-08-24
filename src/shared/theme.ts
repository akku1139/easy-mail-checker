import type { Accent, Settings, ThemeMode } from "./types";

/**
 * Theme engine: CSS custom properties on <html data-theme="light|dark">.
 * "system" simply drops the attribute; assets/ui.css switches palettes via a
 * prefers-color-scheme media query, so the OS setting is followed live.
 */

export const ACCENTS: Accent[] = ["blue", "green", "purple"];

export function applyTheme(settings: Pick<Settings, "themeMode" | "accent">): void {
  const html = document.documentElement;
  html.dataset.accent = settings.accent;
  applyMode(settings.themeMode);
}

export function applyMode(mode: ThemeMode): void {
  const html = document.documentElement;
  if (mode === "system") {
    delete html.dataset.theme;
    html.dataset.themeMode = "system";
  } else {
    html.dataset.theme = mode;
    html.dataset.themeMode = mode;
  }
}
