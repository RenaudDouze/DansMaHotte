// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyAccessibilityPreference, getAccessibilityPreference, setAccessibilityPreference } from "./accessibilityPreference";

describe("accessibility", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-large-text");
    document.documentElement.removeAttribute("data-high-contrast");
    document.documentElement.removeAttribute("data-reduce-motion");
  });

  describe("getAccessibilityPreference", () => {
    it("vaut tout désactivé par défaut", () => {
      expect(getAccessibilityPreference()).toEqual({ largeText: false, highContrast: false, reduceMotion: false });
    });

    it("lit la préférence stockée si valide", () => {
      localStorage.setItem("dmh:a11y", JSON.stringify({ largeText: true, highContrast: false, reduceMotion: true }));
      expect(getAccessibilityPreference()).toEqual({ largeText: true, highContrast: false, reduceMotion: true });
    });

    it("retombe sur tout désactivé si la valeur stockée est un JSON invalide", () => {
      localStorage.setItem("dmh:a11y", "not json");
      expect(getAccessibilityPreference()).toEqual({ largeText: false, highContrast: false, reduceMotion: false });
    });

    it("retombe sur tout désactivé pour l'ancien format (chaîne \"on\"/\"off\")", () => {
      localStorage.setItem("dmh:a11y", "on");
      expect(getAccessibilityPreference()).toEqual({ largeText: false, highContrast: false, reduceMotion: false });
    });

    it("retombe sur tout désactivé si localStorage lève", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });
      expect(getAccessibilityPreference()).toEqual({ largeText: false, highContrast: false, reduceMotion: false });
      spy.mockRestore();
    });
  });

  describe("applyAccessibilityPreference", () => {
    it("pose chaque attribut indépendamment selon la préférence", () => {
      applyAccessibilityPreference({ largeText: true, highContrast: false, reduceMotion: true });
      expect(document.documentElement.hasAttribute("data-large-text")).toBe(true);
      expect(document.documentElement.hasAttribute("data-high-contrast")).toBe(false);
      expect(document.documentElement.hasAttribute("data-reduce-motion")).toBe(true);
    });

    it("retire les attributs pour un réglage désactivé", () => {
      document.documentElement.setAttribute("data-large-text", "");
      applyAccessibilityPreference({ largeText: false, highContrast: false, reduceMotion: false });
      expect(document.documentElement.hasAttribute("data-large-text")).toBe(false);
    });
  });

  describe("setAccessibilityPreference", () => {
    it("persiste et applique les attributs", () => {
      setAccessibilityPreference({ largeText: false, highContrast: true, reduceMotion: false });
      expect(JSON.parse(localStorage.getItem("dmh:a11y")!)).toEqual({ largeText: false, highContrast: true, reduceMotion: false });
      expect(document.documentElement.hasAttribute("data-high-contrast")).toBe(true);
    });

    it("applique quand même si localStorage lève", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      setAccessibilityPreference({ largeText: true, highContrast: false, reduceMotion: false });
      expect(document.documentElement.hasAttribute("data-large-text")).toBe(true);
      spy.mockRestore();
    });
  });

  describe("lecture réglage par réglage", () => {
    it.each([
      [{ largeText: true, highContrast: false, reduceMotion: false }],
      [{ largeText: false, highContrast: true, reduceMotion: false }],
      [{ largeText: false, highContrast: false, reduceMotion: true }],
      [{ largeText: true, highContrast: true, reduceMotion: true }],
    ])("relit exactement %j", (pref) => {
      localStorage.setItem("dmh:a11y", JSON.stringify(pref));
      expect(getAccessibilityPreference()).toStrictEqual(pref);
    });

    it("ignore une valeur non booléenne", () => {
      localStorage.setItem("dmh:a11y", JSON.stringify({ largeText: "true", highContrast: 1, reduceMotion: null }));
      expect(getAccessibilityPreference()).toStrictEqual({ largeText: false, highContrast: false, reduceMotion: false });
    });

    it("retombe sur tout désactivé si la valeur stockée est `null` ou vide", () => {
      localStorage.setItem("dmh:a11y", "null");
      expect(getAccessibilityPreference()).toStrictEqual({ largeText: false, highContrast: false, reduceMotion: false });
      localStorage.setItem("dmh:a11y", "");
      expect(getAccessibilityPreference()).toStrictEqual({ largeText: false, highContrast: false, reduceMotion: false });
    });
  });
});
