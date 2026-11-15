// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHideCheckedPreference, setHideCheckedPreference, toggleHideCheckedPreference } from "./hideCheckedPreference";

describe("hideCheckedPreference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getHideCheckedPreference", () => {
    it("vaut false par défaut", () => {
      expect(getHideCheckedPreference()).toBe(false);
    });

    it("vaut true si la valeur stockée est \"1\"", () => {
      localStorage.setItem("dmh:hideChecked", "1");
      expect(getHideCheckedPreference()).toBe(true);
    });

    it("vaut false pour toute autre valeur stockée", () => {
      localStorage.setItem("dmh:hideChecked", "0");
      expect(getHideCheckedPreference()).toBe(false);
    });

    it("vaut false si localStorage lève", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });
      expect(getHideCheckedPreference()).toBe(false);
      spy.mockRestore();
    });
  });

  describe("setHideCheckedPreference", () => {
    it("persiste true en \"1\"", () => {
      setHideCheckedPreference(true);
      expect(localStorage.getItem("dmh:hideChecked")).toBe("1");
    });

    it("persiste false en \"0\"", () => {
      setHideCheckedPreference(false);
      expect(localStorage.getItem("dmh:hideChecked")).toBe("0");
    });

    it("ne lève pas si localStorage lève", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => setHideCheckedPreference(true)).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("toggleHideCheckedPreference", () => {
    it("bascule false ↔ true", () => {
      expect(getHideCheckedPreference()).toBe(false);
      expect(toggleHideCheckedPreference()).toBe(true);
      expect(toggleHideCheckedPreference()).toBe(false);
    });
  });
});
