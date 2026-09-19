import { describe, it, expect } from "vitest";
import * as LZString from "lz-string";
import { encodeCompactShare, decodeCompactShare } from "./compactShare";
import type { ImportPayload } from "./importPayload";

const payload: ImportPayload = {
  name: "Liste de Noël",
  items: [{ id: "i1", name: "Vélo", recipientId: null, checked: false, order: 0, createdAt: 1, updatedAt: 1, hasImage: false, imageVersion: 0 }],
  recipients: [{ id: "r1", name: "Alice", order: 0 }],
};

describe("encodeCompactShare / decodeCompactShare", () => {
  it("fait un aller-retour fidèle", () => {
    const encoded = encodeCompactShare(payload);
    expect(decodeCompactShare(encoded)).toEqual(payload);
  });

  it("survit à un aller-retour via URLSearchParams (utilisation réelle dans un lien)", () => {
    const encoded = encodeCompactShare(payload);
    const params = new URLSearchParams();
    params.set("import", encoded);
    const roundTripped = new URLSearchParams(params.toString()).get("import");
    expect(decodeCompactShare(roundTripped)).toEqual(payload);
  });

  it("retourne null pour une valeur manquante ou vide", () => {
    expect(decodeCompactShare(null)).toBeNull();
    expect(decodeCompactShare(undefined)).toBeNull();
    expect(decodeCompactShare("")).toBeNull();
  });

  it("retourne null pour une chaîne corrompue (pas de la compression lz-string valide)", () => {
    expect(decodeCompactShare("!!!pas-du-tout-valide!!!")).toBeNull();
  });

  it("retourne null si le contenu décompressé n'est pas un JSON valide", () => {
    const encoded = LZString.compressToEncodedURIComponent("pas du json {");
    expect(decodeCompactShare(encoded)).toBeNull();
  });

  it("retourne null si le contenu décompressé n'a pas la forme d'un ImportPayload", () => {
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify({ foo: "bar" }));
    expect(decodeCompactShare(encoded)).toBeNull();
  });
});
