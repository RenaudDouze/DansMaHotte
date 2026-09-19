import { describe, it, expect } from "vitest";
import { parseImportPayload } from "./importPayload";

describe("parseImportPayload", () => {
  it("accepte un objet complet et le renvoie tel quel", () => {
    const data = { name: "Ma liste", items: [{ id: "1" }], recipients: [{ id: "r1" }] };
    expect(parseImportPayload(data)).toEqual(data);
  });

  it("remplace un nom manquant ou invalide par une chaîne vide", () => {
    expect(parseImportPayload({ items: [], recipients: [] })).toEqual({ name: "", items: [], recipients: [] });
    expect(parseImportPayload({ name: 42, items: [], recipients: [] })).toEqual({ name: "", items: [], recipients: [] });
  });

  const REJECT_MESSAGE = "Ce contenu ne ressemble pas à un export de liste de cadeaux.";

  it("rejette une valeur qui n'est pas un objet", () => {
    expect(() => parseImportPayload(null)).toThrow(REJECT_MESSAGE);
    expect(() => parseImportPayload("texte")).toThrow(REJECT_MESSAGE);
    expect(() => parseImportPayload(42)).toThrow(REJECT_MESSAGE);
  });

  it("rejette un objet dont items n'est pas un tableau", () => {
    expect(() => parseImportPayload({ items: "pas un tableau", recipients: [] })).toThrow(REJECT_MESSAGE);
  });

  it("rejette un objet dont recipients n'est pas un tableau", () => {
    expect(() => parseImportPayload({ items: [], recipients: "pas un tableau" })).toThrow(REJECT_MESSAGE);
  });
});
