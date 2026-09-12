import { describe, it, expect } from "vitest";
import { sanitizeParticipantName, MAX_PARTICIPANT_NAME_LENGTH } from "./presence";

describe("sanitizeParticipantName", () => {
  it("laisse passer un nom valide tel quel", () => {
    expect(sanitizeParticipantName("Renard curieux")).toBe("Renard curieux");
  });

  it("retombe sur « Invité » pour null", () => {
    expect(sanitizeParticipantName(null)).toBe("Invité");
  });

  it("retombe sur « Invité » pour une chaîne vide ou blanche", () => {
    expect(sanitizeParticipantName("")).toBe("Invité");
    expect(sanitizeParticipantName("   ")).toBe("Invité");
  });

  it("coupe les espaces de bord", () => {
    expect(sanitizeParticipantName("  Chat malicieux  ")).toBe("Chat malicieux");
  });

  it("tronque à MAX_PARTICIPANT_NAME_LENGTH caractères", () => {
    const long = "x".repeat(MAX_PARTICIPANT_NAME_LENGTH + 10);
    const result = sanitizeParticipantName(long);
    expect(result).toHaveLength(MAX_PARTICIPANT_NAME_LENGTH);
    expect(result).toBe("x".repeat(MAX_PARTICIPANT_NAME_LENGTH));
  });
});
