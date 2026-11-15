// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openAccessibilityModal } from "./accessibilityModal";
import { getAccessibilityPreference, setAccessibilityPreference } from "../lib/accessibilityPreference";

describe("openAccessibilityModal", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    document.documentElement.removeAttribute("data-large-text");
    document.documentElement.removeAttribute("data-high-contrast");
    document.documentElement.removeAttribute("data-reduce-motion");
  });

  it("affiche les trois réglages, tous décochés par défaut", () => {
    openAccessibilityModal();
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;

    const checkboxes = overlay.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
    expect(checkboxes).toHaveLength(3);
    checkboxes.forEach((cb) => expect(cb.checked).toBe(false));
    expect(overlay.querySelector('[data-key="largeText"]')).not.toBeNull();
    expect(overlay.querySelector('[data-key="highContrast"]')).not.toBeNull();
    expect(overlay.querySelector('[data-key="reduceMotion"]')).not.toBeNull();
  });

  it("reflète la préférence déjà stockée à l'ouverture", () => {
    setAccessibilityPreference({ largeText: true, highContrast: false, reduceMotion: true });

    openAccessibilityModal();
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;

    expect(overlay.querySelector<HTMLInputElement>('[data-key="largeText"]')!.checked).toBe(true);
    expect(overlay.querySelector<HTMLInputElement>('[data-key="highContrast"]')!.checked).toBe(false);
    expect(overlay.querySelector<HTMLInputElement>('[data-key="reduceMotion"]')!.checked).toBe(true);
  });

  it("cocher une case applique immédiatement le réglage sans toucher aux autres", () => {
    openAccessibilityModal();
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;
    const largeText = overlay.querySelector<HTMLInputElement>('[data-key="largeText"]')!;

    largeText.checked = true;
    largeText.dispatchEvent(new Event("change"));

    expect(getAccessibilityPreference()).toEqual({ largeText: true, highContrast: false, reduceMotion: false });
    expect(document.documentElement.hasAttribute("data-large-text")).toBe(true);
  });

  it("décocher une case déjà activée la retire, en préservant les autres réglages", () => {
    setAccessibilityPreference({ largeText: true, highContrast: true, reduceMotion: false });
    openAccessibilityModal();
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;
    const highContrast = overlay.querySelector<HTMLInputElement>('[data-key="highContrast"]')!;

    highContrast.checked = false;
    highContrast.dispatchEvent(new Event("change"));

    expect(getAccessibilityPreference()).toEqual({ largeText: true, highContrast: false, reduceMotion: false });
  });

  it("place le focus dans la modale à l'ouverture (piège de focus)", () => {
    openAccessibilityModal();
    const modal = document.querySelector(".modal") as HTMLElement;

    expect(document.activeElement).toBe(modal);
  });

  it("le bouton de fermeture ferme la modale et retire l'écouteur clavier", () => {
    openAccessibilityModal();
    (document.querySelector(".modal-close") as HTMLElement).click();

    expect(document.querySelector(".modal-overlay")).toBeNull();
  });

  it("Échap ferme la modale", () => {
    openAccessibilityModal();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.querySelector(".modal-overlay")).toBeNull();
  });

  it("une touche autre qu'Échap ne ferme pas la modale", () => {
    openAccessibilityModal();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(document.querySelector(".modal-overlay")).not.toBeNull();
  });

  it("cliquer sur l'overlay (en dehors de la modale) la ferme", () => {
    openAccessibilityModal();
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;

    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(".modal-overlay")).toBeNull();
  });

  it("cliquer à l'intérieur de la modale ne la ferme pas", () => {
    openAccessibilityModal();
    const modal = document.querySelector(".modal") as HTMLElement;

    modal.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(".modal-overlay")).not.toBeNull();
  });

  it("affiche libellé et description de chaque réglage, sans texte parasite entre les lignes", () => {
    openAccessibilityModal();
    const rows = Array.from(document.querySelectorAll(".accessibility-option"));
    expect(rows.map((r) => [r.querySelector("strong")!.textContent, r.querySelector("small")!.textContent])).toEqual([
      ["Texte plus grand", "Augmente la taille du texte dans toute l'application."],
      ["Contraste élevé", "Renforce le contraste entre le texte et le fond."],
      ["Réduire les animations", "Désactive les transitions et animations."],
    ]);
    const list = document.querySelector(".accessibility-options")!;
    const stray = Array.from(list.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== "");
    expect(stray).toHaveLength(0);
  });

  it("à la fermeture, retire l'écouteur clavier et rend le focus à l'élément précédent", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const remove = vi.spyOn(document, "removeEventListener");
    openAccessibilityModal();
    expect(document.activeElement).not.toBe(outside);

    (document.querySelector(".modal-close") as HTMLElement).click();

    expect(remove.mock.calls.map(([type]) => type)).toContain("keydown");
    expect(document.activeElement).toBe(outside);
    remove.mockRestore();
  });
});
