export interface AccessibilityPreference {
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
}

const KEY = "dmh:a11y";

const DEFAULT_PREFERENCE: AccessibilityPreference = { largeText: false, highContrast: false, reduceMotion: false };

/** Personal, per-device display preference (like the theme or item sort) —
 * never synced to the shared list state. Defaults to everything off, so
 * nothing changes unless the user opts in. */
export function getAccessibilityPreference(): AccessibilityPreference {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFERENCE };
    const parsed = JSON.parse(raw);
    return {
      largeText: parsed?.largeText === true,
      highContrast: parsed?.highContrast === true,
      reduceMotion: parsed?.reduceMotion === true,
    };
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}

/** Reflects the preference as boolean data-attributes on <html>, read by
 * style.css — applied both at boot (main.ts) and on every change, so a
 * reload never needs to guess the previous state. */
export function applyAccessibilityPreference(pref: AccessibilityPreference): void {
  const root = document.documentElement;
  root.toggleAttribute("data-large-text", pref.largeText);
  root.toggleAttribute("data-high-contrast", pref.highContrast);
  root.toggleAttribute("data-reduce-motion", pref.reduceMotion);
}

export function setAccessibilityPreference(pref: AccessibilityPreference): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pref));
  } catch {
    // storage unavailable, preference just won't persist across reloads
  }
  applyAccessibilityPreference(pref);
}
