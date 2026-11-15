// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHiddenRecipientIds, isRecipientHidden, setRecipientHidden, toggleRecipientHidden } from "./hiddenRecipientsPreference";

describe("hiddenRecipientsPreference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getHiddenRecipientIds", () => {
    it("vaut une liste vide par défaut", () => {
      expect(getHiddenRecipientIds()).toEqual([]);
    });

    it("relit les identifiants stockés", () => {
      localStorage.setItem("dmh:hiddenRecipients", JSON.stringify(["a", "b"]));
      expect(getHiddenRecipientIds()).toEqual(["a", "b"]);
    });

    it("ignore les éléments qui ne sont pas des chaînes", () => {
      localStorage.setItem("dmh:hiddenRecipients", JSON.stringify(["a", 3, null, "b"]));
      expect(getHiddenRecipientIds()).toEqual(["a", "b"]);
    });

    it.each([["null"], ["{\"a\":1}"], ["\"texte\""], ["pas du json"], [""]])("vaut une liste vide pour la valeur stockée %j", (raw) => {
      localStorage.setItem("dmh:hiddenRecipients", raw);
      expect(getHiddenRecipientIds()).toEqual([]);
    });

    it("vaut une liste vide si localStorage lève", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });
      expect(getHiddenRecipientIds()).toEqual([]);
      spy.mockRestore();
    });
  });

  describe("setRecipientHidden / isRecipientHidden", () => {
    it("masque puis réaffiche une personne, sans toucher aux autres", () => {
      setRecipientHidden("a", true);
      setRecipientHidden("b", true);
      expect(isRecipientHidden("a")).toBe(true);
      expect(isRecipientHidden("c")).toBe(false);

      setRecipientHidden("a", false);
      expect(getHiddenRecipientIds()).toEqual(["b"]);
      expect(JSON.parse(localStorage.getItem("dmh:hiddenRecipients")!)).toEqual(["b"]);
    });

    it("masquer deux fois n'ajoute pas de doublon", () => {
      setRecipientHidden("a", true);
      setRecipientHidden("a", true);
      expect(getHiddenRecipientIds()).toEqual(["a"]);
    });

    it("réafficher une personne non masquée ne change rien", () => {
      setRecipientHidden("a", true);
      setRecipientHidden("z", false);
      expect(getHiddenRecipientIds()).toEqual(["a"]);
    });

    it("ne lève pas si localStorage.setItem lève", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => setRecipientHidden("a", true)).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("toggleRecipientHidden", () => {
    it("bascule et renvoie le nouvel état", () => {
      expect(toggleRecipientHidden("a")).toBe(true);
      expect(isRecipientHidden("a")).toBe(true);
      expect(toggleRecipientHidden("a")).toBe(false);
      expect(isRecipientHidden("a")).toBe(false);
    });
  });
});
