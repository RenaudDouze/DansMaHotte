// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { escapeHtml } from "./dom";

describe("escapeHtml", () => {
  it("échappe les caractères spéciaux HTML", () => {
    expect(escapeHtml(`<script>alert("x'y")</script>&`)).toBe("&lt;script&gt;alert(&quot;x&#39;y&quot;)&lt;/script&gt;&amp;");
  });

  it("laisse une chaîne sans caractère spécial inchangée", () => {
    expect(escapeHtml("Pommes 2 kg")).toBe("Pommes 2 kg");
  });

  it("a bien accès au DOM dans cet environnement (vérifie que jsdom est actif)", () => {
    expect(typeof document).toBe("object");
  });
});
