import { describe, it, expect } from "vitest";
import { encryptJson, decryptJson } from "./crypto";

describe("encryptJson / decryptJson", () => {
  it("fait un aller-retour fidèle sur une valeur quelconque (objet imbriqué)", async () => {
    const value = { code: "ABC123", items: [{ name: "Lait", checked: false }], count: 2 };
    const payload = await encryptJson("ABC123", value);
    const result = await decryptJson<typeof value>("ABC123", payload);
    expect(result).toEqual(value);
  });

  it("ne stocke jamais le contenu en clair dans le chiffré", async () => {
    const payload = await encryptJson("CODE01", { name: "Ingrédient très privé" });
    expect(payload.ciphertext).not.toContain("Ingrédient");
    expect(payload.ciphertext).not.toContain("privé");
  });

  it("produit un iv différent à chaque appel (jamais réutilisé)", async () => {
    const a = await encryptJson("CODE01", { x: 1 });
    const b = await encryptJson("CODE01", { x: 1 });
    expect(a.iv).not.toBe(b.iv);
  });

  it("échoue à déchiffrer avec un autre code que celui utilisé pour chiffrer", async () => {
    const payload = await encryptJson("CODE01", { secret: true });
    await expect(decryptJson("CODE02", payload)).rejects.toThrow();
  });
});
