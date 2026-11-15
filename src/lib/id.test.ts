import { describe, expect, it } from "vitest";
import { uid } from "./id";

describe("uid", () => {
  it("génère un UUID v4", () => {
    expect(uid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("génère un id différent à chaque appel", () => {
    expect(uid()).not.toBe(uid());
  });
});
