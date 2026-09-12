export const MAX_PARTICIPANT_NAME_LENGTH = 30;

/** A connected participant's display name always survives round-tripping
 * through this: never empty, never longer than MAX_PARTICIPANT_NAME_LENGTH.
 * Defensive against a client sending nothing (or garbage) as `?name=`. */
export function sanitizeParticipantName(raw: string | null): string {
  const trimmed = (raw ?? "").trim().slice(0, MAX_PARTICIPANT_NAME_LENGTH);
  return trimmed || "Invité";
}
