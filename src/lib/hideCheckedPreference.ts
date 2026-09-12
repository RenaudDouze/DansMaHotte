const KEY = "dmh:hideChecked";

/** Personal, per-device display preference (like the theme or item sort) —
 * never synced to the shared list state. Defaults to false (checked items
 * stay visible, the existing behavior) so nothing changes unless the user
 * opts in. */
export function getHideCheckedPreference(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setHideCheckedPreference(hide: boolean): void {
  try {
    localStorage.setItem(KEY, hide ? "1" : "0");
  } catch {
    // storage unavailable, preference just won't persist across reloads
  }
}

export function toggleHideCheckedPreference(): boolean {
  const next = !getHideCheckedPreference();
  setHideCheckedPreference(next);
  return next;
}
