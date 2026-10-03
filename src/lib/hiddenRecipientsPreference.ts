const KEY = "dmh:hiddenRecipients";

function safeParseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Personal, per-device display preference (like the theme or item sort) —
 * never synced to the shared list state, and not a real access control (see
 * CLAUDE.md's privacy model): a hidden recipient's gifts stay fully visible
 * to anyone with the list code, from another device or by toggling them
 * back here. Meant only to avoid an accidental glance over someone's
 * shoulder — e.g. handing your own phone to that very person. */
export function getHiddenRecipientIds(): string[] {
  try {
    return safeParseIds(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function isRecipientHidden(id: string): boolean {
  return getHiddenRecipientIds().includes(id);
}

export function setRecipientHidden(id: string, hidden: boolean): void {
  const ids = getHiddenRecipientIds();
  const next = hidden ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((existing) => existing !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable, preference just won't persist across reloads
  }
}

export function toggleRecipientHidden(id: string): boolean {
  const next = !isRecipientHidden(id);
  setRecipientHidden(id, next);
  return next;
}
