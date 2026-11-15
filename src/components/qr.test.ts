import { describe, expect, it } from "vitest";
import { renderQrSvg } from "./qr";

describe("renderQrSvg", () => {
  it("génère un SVG à partir du texte fourni", async () => {
    const svg = await renderQrSvg("https://example.com/l/ABCDEF");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("utilise la couleur de l'app pour les modules et un fond transparent", async () => {
    const svg = await renderQrSvg("x");
    expect(svg).toContain('stroke="#123524"');
    expect(svg).not.toContain("#ffffff");
  });
});
