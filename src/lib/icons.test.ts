import { describe, expect, it } from "vitest";
import { icons } from "./icons";

describe("icons", () => {
  it("rend chaque icône en <svg> accessible (aria-hidden, non focusable)", () => {
    for (const [name, markup] of Object.entries(icons)) {
      expect(markup, name).toMatch(/^<svg viewBox="0 0 24 24"/);
      expect(markup, name).toContain('aria-hidden="true"');
      expect(markup, name).toContain('focusable="false"');
    }
  });

  it("utilise le tracé (stroke) par défaut", () => {
    expect(icons.back).toContain('stroke="currentColor"');
    expect(icons.back).not.toContain('fill="currentColor" stroke="none"');
  });

  it("bascule en remplissage (fill) pour les icônes déclarées filled", () => {
    expect(icons.more).toContain('fill="currentColor" stroke="none"');
  });
});
