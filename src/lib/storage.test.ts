// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheListState,
  forgetRecentList,
  getCachedListState,
  getRecentLists,
  toggleFavoriteList,
  touchRecentList,
} from "./storage";
import type { ListState } from "../../shared/types";

const sampleState: ListState = {
  code: "ABCDEF",
  name: "Courses",
  items: [],
  recipients: [],
  createdAt: 0,
  updatedAt: 0,
};

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getRecentLists", () => {
    it("renvoie un tableau vide si rien n'est stocké", () => {
      expect(getRecentLists()).toEqual([]);
    });

    it("renvoie [] si le JSON stocké est invalide", () => {
      localStorage.setItem("dmh:recent", "{ pas du json");
      expect(getRecentLists()).toEqual([]);
    });

    it("trie par dernière ouverture décroissante", () => {
      localStorage.setItem(
        "dmh:recent",
        JSON.stringify([
          { code: "AAA", name: "Plus ancienne", lastOpened: 1 },
          { code: "BBB", name: "Plus récente", lastOpened: 2 },
        ]),
      );
      expect(getRecentLists().map((l) => l.code)).toEqual(["BBB", "AAA"]);
    });
  });

  describe("touchRecentList", () => {
    it("ajoute une nouvelle liste en tête", () => {
      touchRecentList("ABCDEF", "Courses");
      const [entry] = getRecentLists();
      expect(entry.code).toBe("ABCDEF");
      expect(entry.name).toBe("Courses");
      expect(entry.favorite).toBeUndefined();
    });

    it("remonte une liste déjà connue en tête, sans dupliquer, en préservant le favori", () => {
      touchRecentList("AAA", "Ancienne");
      touchRecentList("BBB", "Récente");
      toggleFavoriteList("AAA");

      touchRecentList("AAA", "Ancienne renommée");

      const lists = getRecentLists();
      expect(lists).toHaveLength(2);
      expect(lists[0].code).toBe("AAA");
      expect(lists[0].name).toBe("Ancienne renommée");
      expect(lists[0].favorite).toBe(true);
    });

    it("plafonne à 20 entrées, en retirant les plus anciennes", () => {
      for (let i = 0; i < 25; i++) touchRecentList(`CODE${i}`, `Liste ${i}`);
      expect(getRecentLists()).toHaveLength(20);
      expect(getRecentLists().map((l) => l.code)).toContain("CODE24");
      expect(getRecentLists().map((l) => l.code)).not.toContain("CODE0");
    });

    it("ne lève pas si localStorage.setItem lève", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => touchRecentList("ABCDEF", "Courses")).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("forgetRecentList", () => {
    it("retire la liste indiquée", () => {
      touchRecentList("AAA", "A");
      touchRecentList("BBB", "B");
      forgetRecentList("AAA");
      expect(getRecentLists().map((l) => l.code)).toEqual(["BBB"]);
    });

    it("ne lève pas si localStorage.setItem lève", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => forgetRecentList("ABCDEF")).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("toggleFavoriteList", () => {
    it("bascule le favori de la liste indiquée sans toucher aux autres", () => {
      touchRecentList("AAA", "A");
      touchRecentList("BBB", "B");

      toggleFavoriteList("AAA");
      let lists = getRecentLists();
      expect(lists.find((l) => l.code === "AAA")?.favorite).toBe(true);
      expect(lists.find((l) => l.code === "BBB")?.favorite).toBeUndefined();

      toggleFavoriteList("AAA");
      lists = getRecentLists();
      expect(lists.find((l) => l.code === "AAA")?.favorite).toBe(false);
    });

    it("ne lève pas si localStorage.setItem lève", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => toggleFavoriteList("ABCDEF")).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("cacheListState / getCachedListState", () => {
    it("écrit le cache sous la clé « dmh:cache:CODE »", () => {
      cacheListState(sampleState);
      expect(localStorage.getItem(`dmh:cache:${sampleState.code}`)).not.toBeNull();
    });

    it("relit exactement l'état mis en cache", () => {
      cacheListState(sampleState);
      expect(getCachedListState("ABCDEF")).toEqual(sampleState);
    });

    it("renvoie null si rien n'est en cache pour ce code", () => {
      expect(getCachedListState("ZZZZZZ")).toBeNull();
    });

    it("renvoie null si le cache contient du JSON invalide", () => {
      localStorage.setItem("dmh:cache:ABCDEF", "{ pas du json");
      expect(getCachedListState("ABCDEF")).toBeNull();
    });

    it("cacheListState ne lève pas si localStorage.setItem lève", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => cacheListState(sampleState)).not.toThrow();
      spy.mockRestore();
    });
  });
});
