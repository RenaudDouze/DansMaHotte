import { beforeEach, describe, expect, it } from "vitest";
import { clearPendingImport, peekPendingImport, setPendingImport, takePendingImport } from "./pendingImport";

const payload = { name: "Noël", items: [], recipients: [] };

describe("pendingImport", () => {
  beforeEach(() => {
    clearPendingImport();
  });

  it("est vide au départ", () => {
    expect(peekPendingImport()).toBeNull();
    expect(takePendingImport()).toBeNull();
  });

  it("peek lit sans consommer", () => {
    setPendingImport(payload);
    expect(peekPendingImport()).toBe(payload);
    expect(peekPendingImport()).toBe(payload);
  });

  it("take lit puis efface", () => {
    setPendingImport(payload);
    expect(takePendingImport()).toBe(payload);
    expect(peekPendingImport()).toBeNull();
    expect(takePendingImport()).toBeNull();
  });

  it("clear efface sans lire", () => {
    setPendingImport(payload);
    clearPendingImport();
    expect(peekPendingImport()).toBeNull();
  });
});
