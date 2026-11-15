// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, cycleThemePreference, getThemePreference, setThemePreference, themeLabel } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  describe("getThemePreference", () => {
    it("vaut \"system\" par défaut (rien en localStorage)", () => {
      expect(getThemePreference()).toBe("system");
    });

    it("lit la préférence stockée si valide", () => {
      localStorage.setItem("dmh:theme", "dark");
      expect(getThemePreference()).toBe("dark");
    });

    it("retombe sur \"system\" si la valeur stockée est invalide", () => {
      localStorage.setItem("dmh:theme", "bleu-nuit");
      expect(getThemePreference()).toBe("system");
    });

    it("retombe sur \"system\" si localStorage lève (navigation privée stricte)", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });
      expect(getThemePreference()).toBe("system");
      spy.mockRestore();
    });
  });

  describe("applyTheme", () => {
    it("retire l'attribut data-theme pour \"system\"", () => {
      document.documentElement.setAttribute("data-theme", "dark");
      applyTheme("system");
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });

    it("pose data-theme pour un choix explicite", () => {
      applyTheme("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  describe("setThemePreference", () => {
    it("persiste et applique l'attribut", () => {
      setThemePreference("dark");
      expect(localStorage.getItem("dmh:theme")).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("applique quand même le thème si localStorage lève", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      setThemePreference("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      spy.mockRestore();
    });
  });

  describe("cycleThemePreference", () => {
    it("boucle system → light → dark → system", () => {
      expect(getThemePreference()).toBe("system");
      expect(cycleThemePreference()).toBe("light");
      expect(cycleThemePreference()).toBe("dark");
      expect(cycleThemePreference()).toBe("system");
    });
  });

  describe("themeLabel", () => {
    it("traduit chaque valeur en libellé affiché", () => {
      expect(themeLabel("system")).toBe("Auto");
      expect(themeLabel("light")).toBe("Clair");
      expect(themeLabel("dark")).toBe("Sombre");
    });
  });
});
