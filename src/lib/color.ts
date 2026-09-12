import type { Recipient } from "../../shared/types";

/** Deterministic hue (0-359) for a recipient id, used for a subtle
 * per-recipient accent (dot + left border) — same id always gets the same
 * color, without needing to store one explicitly. */
export function recipientHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

/** The hue actually used for a recipient: the user's manual choice
 * (Recipient.color) if set, otherwise the automatic one derived from its id. */
export function resolveRecipientHue(recipient: Recipient): number {
  return recipient.color ?? recipientHue(recipient.id);
}
