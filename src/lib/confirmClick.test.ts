// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wireConfirmClick } from "./confirmClick";

describe("wireConfirmClick", () => {
  let button: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    button = document.createElement("button");
    button.setAttribute("aria-label", "Supprimer");
    document.body.appendChild(button);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("le premier clic arme le bouton sans confirmer", () => {
    const onConfirm = vi.fn();
    wireConfirmClick(button, { armedLabel: "Confirmer ?", onConfirm });

    button.click();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.classList.contains("confirm-armed")).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Confirmer ?");
  });

  it("le second clic au même endroit confirme et désarme", () => {
    const onConfirm = vi.fn();
    wireConfirmClick(button, { armedLabel: "Confirmer ?", onConfirm });

    button.click();
    button.click();

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(button.classList.contains("confirm-armed")).toBe(false);
    expect(button.getAttribute("aria-label")).toBe("Supprimer");
  });

  it("se désarme automatiquement après le délai, sans confirmer", () => {
    const onConfirm = vi.fn();
    wireConfirmClick(button, { armedLabel: "Confirmer ?", onConfirm, timeoutMs: 3000 });

    button.click();
    vi.advanceTimersByTime(3000);

    expect(button.classList.contains("confirm-armed")).toBe(false);
    expect(button.getAttribute("aria-label")).toBe("Supprimer");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("un clic après expiration du délai réarme au lieu de confirmer", () => {
    const onConfirm = vi.fn();
    wireConfirmClick(button, { armedLabel: "Confirmer ?", onConfirm, timeoutMs: 3000 });

    button.click();
    vi.advanceTimersByTime(3000);
    button.click();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.classList.contains("confirm-armed")).toBe(true);
  });

  it("ignore le clic si isDisabled() renvoie vrai et que le bouton n'est pas armé", () => {
    const onConfirm = vi.fn();
    wireConfirmClick(button, { armedLabel: "Confirmer ?", onConfirm, isDisabled: () => true });

    button.click();

    expect(button.classList.contains("confirm-armed")).toBe(false);
  });

  it("utilise armedText/labelEl pour un bouton texte avec une icône à préserver", () => {
    const label = document.createElement("span");
    label.textContent = "Vider les articles cochés";
    button.appendChild(label);
    const onConfirm = vi.fn();
    wireConfirmClick(button, { armedText: "Confirmer : tout vider ?", labelEl: label, onConfirm });

    button.click();
    expect(label.textContent).toBe("Confirmer : tout vider ?");

    button.click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("ne pose pas d'aria-label au désarmement si le bouton n'en avait pas au départ", () => {
    button.removeAttribute("aria-label");
    const onConfirm = vi.fn();
    wireConfirmClick(button, { armedLabel: "Confirmer ?", onConfirm, timeoutMs: 3000 });

    button.click();
    expect(button.getAttribute("aria-label")).toBe("Confirmer ?");
    vi.advanceTimersByTime(3000);

    // Rien à restaurer : le libellé posé à l'armement reste (pas de retour
    // en arrière vers un état qui n'a jamais existé).
    expect(button.getAttribute("aria-label")).toBe("Confirmer ?");
  });

  it("le clic ne remonte pas au parent (n'y déclenche pas d'autre logique, ex: fermeture de menu)", () => {
    const parentClick = vi.fn();
    document.body.addEventListener("click", parentClick);
    wireConfirmClick(button, { onConfirm: vi.fn() });

    button.click();

    expect(parentClick).not.toHaveBeenCalled();
  });

  it("se désarme par défaut au bout de 3 s exactement", () => {
    wireConfirmClick(button, { armedLabel: "Confirmer ?", onConfirm: vi.fn() });

    button.click();
    vi.advanceTimersByTime(2999);
    expect(button.classList.contains("confirm-armed")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(button.classList.contains("confirm-armed")).toBe(false);
  });

  it("la confirmation annule le minuteur : un réarmement garde son propre délai", () => {
    wireConfirmClick(button, { armedLabel: "Confirmer ?", onConfirm: vi.fn(), timeoutMs: 3000 });

    button.click();
    vi.advanceTimersByTime(1000);
    button.click(); // confirme
    button.click(); // réarme à t = 1000
    vi.advanceTimersByTime(2500); // t = 3500 : l'ancien minuteur serait déjà passé
    expect(button.classList.contains("confirm-armed")).toBe(true);
    vi.advanceTimersByTime(500);
    expect(button.classList.contains("confirm-armed")).toBe(false);
  });

  it("restaure le texte armé après confirmation", () => {
    const label = document.createElement("span");
    label.textContent = "Vider";
    button.appendChild(label);
    wireConfirmClick(button, { armedText: "Confirmer ?", labelEl: label, onConfirm: vi.fn() });

    button.click();
    button.click();

    expect(label.textContent).toBe("Vider");
  });

  it("sans armedText ni armedLabel, ne touche ni au texte ni aux enfants du bouton", () => {
    const icon = document.createElement("i");
    button.appendChild(icon);
    wireConfirmClick(button, { onConfirm: vi.fn() });

    button.click();
    expect(button.firstElementChild).toBe(icon);
    expect(button.getAttribute("aria-label")).toBe("Supprimer");
    button.click();
    expect(button.firstElementChild).toBe(icon);
  });

  it("avec armedText seul, garde l'aria-label d'origine", () => {
    wireConfirmClick(button, { armedText: "Confirmer ?", onConfirm: vi.fn() });

    button.click();

    expect(button.getAttribute("aria-label")).toBe("Supprimer");
    expect(button.textContent).toBe("Confirmer ?");
  });
});
