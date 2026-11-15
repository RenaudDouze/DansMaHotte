// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cycleItemSortPreference, getItemSortPreference, itemSortLabel, setItemSortPreference } from "./itemSortPreference";

describe("itemSortPreference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getItemSortPreference", () => {
    it("vaut \"manual\" par défaut", () => {
      expect(getItemSortPreference()).toBe("manual");
    });

    it("lit la préférence stockée si valide", () => {
      localStorage.setItem("dmh:itemSort", "alphabetical");
      expect(getItemSortPreference()).toBe("alphabetical");
    });

    it("lit aussi le tri par prix", () => {
      localStorage.setItem("dmh:itemSort", "price");
      expect(getItemSortPreference()).toBe("price");
    });

    it("retombe sur \"manual\" si la valeur stockée est invalide", () => {
      localStorage.setItem("dmh:itemSort", "aléatoire");
      expect(getItemSortPreference()).toBe("manual");
    });

    it("retombe sur \"manual\" si localStorage lève", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });
      expect(getItemSortPreference()).toBe("manual");
      spy.mockRestore();
    });
  });

  describe("setItemSortPreference", () => {
    it("persiste la préférence", () => {
      setItemSortPreference("alphabetical");
      expect(localStorage.getItem("dmh:itemSort")).toBe("alphabetical");
    });

    it("ne lève pas si localStorage lève", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => setItemSortPreference("alphabetical")).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("cycleItemSortPreference", () => {
    it("bascule manual → alphabetical → price → manual", () => {
      expect(getItemSortPreference()).toBe("manual");
      expect(cycleItemSortPreference()).toBe("alphabetical");
      expect(cycleItemSortPreference()).toBe("price");
      expect(cycleItemSortPreference()).toBe("manual");
    });
  });

  describe("itemSortLabel", () => {
    it("traduit chaque valeur en libellé affiché", () => {
      expect(itemSortLabel("manual")).toBe("Manuel");
      expect(itemSortLabel("alphabetical")).toBe("Alphabétique");
      expect(itemSortLabel("price")).toBe("Prix");
    });
  });
});
