import { describe, it, expect } from "vitest";
import { recipientHue, resolveRecipientHue } from "./color";

describe("recipientHue", () => {
  it("est déterministe pour un même id", () => {
    expect(recipientHue("r-1")).toBe(recipientHue("r-1"));
  });

  it("reste dans [0, 360)", () => {
    for (const id of ["a", "abc", "une-tres-longue-cle-de-destinataire", ""]) {
      const hue = recipientHue(id);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("des ids différents donnent (généralement) des teintes différentes", () => {
    expect(recipientHue("marie")).not.toBe(recipientHue("paul"));
  });
});

describe("resolveRecipientHue", () => {
  it("utilise la couleur manuelle quand elle est définie", () => {
    expect(resolveRecipientHue({ id: "r1", name: "Marie", order: 0, color: 210 })).toBe(210);
  });

  it("retombe sur la teinte automatique quand aucune couleur n'est définie", () => {
    const recipient = { id: "r1", name: "Marie", order: 0 };
    expect(resolveRecipientHue(recipient)).toBe(recipientHue("r1"));
  });
});
