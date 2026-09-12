export type ItemSortPreference = "manual" | "alphabetical";

const KEY = "dmh:itemSort";
const NEXT: Record<ItemSortPreference, ItemSortPreference> = { manual: "alphabetical", alphabetical: "manual" };
const LABEL: Record<ItemSortPreference, string> = { manual: "Manuel", alphabetical: "Alphabétique" };

function isItemSortPreference(value: unknown): value is ItemSortPreference {
  return value === "manual" || value === "alphabetical";
}

/** Personal, per-device display preference (like the theme) — never synced
 * to the shared list state. Defaults to "manual" (the existing drag-to-reorder
 * behavior) so nothing changes unless the user opts in. */
export function getItemSortPreference(): ItemSortPreference {
  try {
    const stored = localStorage.getItem(KEY);
    return isItemSortPreference(stored) ? stored : "manual";
  } catch {
    return "manual";
  }
}

export function setItemSortPreference(pref: ItemSortPreference): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // storage unavailable, preference just won't persist across reloads
  }
}

export function cycleItemSortPreference(): ItemSortPreference {
  const next = NEXT[getItemSortPreference()];
  setItemSortPreference(next);
  return next;
}

export function itemSortLabel(pref: ItemSortPreference): string {
  return LABEL[pref];
}
