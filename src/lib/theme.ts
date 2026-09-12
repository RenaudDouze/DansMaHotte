export type ThemePreference = "system" | "light" | "dark";

const KEY = "dmh:theme";
const NEXT: Record<ThemePreference, ThemePreference> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemePreference, string> = { system: "Auto", light: "Clair", dark: "Sombre" };

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePreference): void {
  if (pref === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", pref);
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // storage unavailable, theme just won't persist across reloads
  }
  applyTheme(pref);
}

export function cycleThemePreference(): ThemePreference {
  const next = NEXT[getThemePreference()];
  setThemePreference(next);
  return next;
}

export function themeLabel(pref: ThemePreference): string {
  return LABEL[pref];
}
