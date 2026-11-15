import { describe, expect, it } from "vitest";
import { PRIVACY_HINT } from "./privacyHint";

describe("PRIVACY_HINT", () => {
  it("rappelle que les données sont chiffrées mais accessibles à qui a le code", () => {
    expect(PRIVACY_HINT).toContain("chiffrées");
    expect(PRIVACY_HINT).toContain("code");
  });
});
