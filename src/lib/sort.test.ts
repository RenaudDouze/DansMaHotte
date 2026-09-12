import { describe, it, expect } from "vitest";
import { alnumCompare } from "./sort";

describe("alnumCompare", () => {
  it("ignore la casse", () => {
    expect(["banane", "Ananas"].sort(alnumCompare)).toEqual(["Ananas", "banane"]);
  });

  it("ignore les accents", () => {
    expect(["étagère", "epicerie"].sort(alnumCompare)).toEqual(["epicerie", "étagère"]);
  });

  it("compare les nombres numériquement plutôt que caractère par caractère", () => {
    expect(["Article 10", "Article 2"].sort(alnumCompare)).toEqual(["Article 2", "Article 10"]);
  });
});
