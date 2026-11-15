// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trapFocus } from "./focusTrap";

// jsdom ne fait pas de mise en page réelle : offsetParent vaut toujours null,
// ce qui exclurait tout élément de focusableElements() sauf le déjà-focalisé.
// On simule donc "visible" comme le ferait un vrai navigateur pour un
// élément affiché.
function makeVisible(el: HTMLElement): void {
  Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
}

describe("trapFocus", () => {
  let outsideButton: HTMLButtonElement;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    makeVisible(outsideButton);
    outsideButton.focus();

    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("focalise le premier élément focalisable du conteneur à l'activation", () => {
    const first = document.createElement("button");
    const second = document.createElement("button");
    container.append(first, second);
    makeVisible(first);
    makeVisible(second);

    trapFocus(container);

    expect(document.activeElement).toBe(first);
  });

  it("compte comme focalisable un élément déjà activeElement même sans offsetParent (jsdom, pas de vrai layout)", () => {
    const first = document.createElement("button");
    container.append(first);
    first.focus(); // pas de makeVisible : jsdom permet quand même de focaliser un <button>
    expect(document.activeElement).toBe(first);

    trapFocus(container);

    expect(document.activeElement).toBe(first);
  });

  it("focalise le conteneur lui-même s'il n'a pas d'élément focalisable (et un tabindex)", () => {
    container.tabIndex = -1;

    trapFocus(container);

    expect(document.activeElement).toBe(container);
  });

  it("Tab depuis le dernier élément revient au premier (piège le focus)", () => {
    const first = document.createElement("button");
    const second = document.createElement("button");
    container.append(first, second);
    makeVisible(first);
    makeVisible(second);
    trapFocus(container);
    second.focus();

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    expect(document.activeElement).toBe(first);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Shift+Tab depuis le premier élément revient au dernier", () => {
    const first = document.createElement("button");
    const second = document.createElement("button");
    container.append(first, second);
    makeVisible(first);
    makeVisible(second);
    trapFocus(container);
    first.focus();

    const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    expect(document.activeElement).toBe(second);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Tab au milieu de la liste ne fait rien (laisse le navigateur gérer)", () => {
    const first = document.createElement("button");
    const middle = document.createElement("button");
    const last = document.createElement("button");
    container.append(first, middle, last);
    makeVisible(first);
    makeVisible(middle);
    makeVisible(last);
    trapFocus(container);
    middle.focus();

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    expect(document.activeElement).toBe(middle);
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignore les touches autres que Tab", () => {
    const first = document.createElement("button");
    container.append(first);
    makeVisible(first);
    trapFocus(container);

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("Tab ne fait rien si le conteneur redevient sans élément focalisable (branche focusable.length === 0)", () => {
    const first = document.createElement("button");
    container.append(first);
    makeVisible(first);
    trapFocus(container);
    container.removeChild(first);

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    expect(() => container.dispatchEvent(event)).not.toThrow();
    expect(event.defaultPrevented).toBe(false);
  });

  it("le nettoyage retire l'écouteur et restaure le focus précédent", () => {
    const first = document.createElement("button");
    container.append(first);
    makeVisible(first);
    const release = trapFocus(container);
    expect(document.activeElement).toBe(first);

    release();

    expect(document.activeElement).toBe(outsideButton);

    // L'écouteur est bien retiré : Tab ne fait plus rien après le nettoyage.
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    container.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("le nettoyage ne plante pas si document.activeElement valait null à l'activation", () => {
    const spy = vi.spyOn(document, "activeElement", "get").mockReturnValue(null);
    const first = document.createElement("button");
    container.append(first);
    makeVisible(first);
    const release = trapFocus(container);
    spy.mockRestore();
    expect(() => release()).not.toThrow();
  });

  function setup(count: number, visible: boolean[] = []): HTMLButtonElement[] {
    const buttons = Array.from({ length: count }, () => document.createElement("button"));
    container.append(...buttons);
    buttons.forEach((b, i) => {
      if (visible[i] ?? true) makeVisible(b);
    });
    return buttons;
  }
  const tab = (shiftKey = false) => new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });

  it("saute les éléments non affichés (sans offsetParent) à l'activation", () => {
    const [hidden, shown] = setup(2, [false, true]);
    trapFocus(container);
    expect(hidden).not.toBe(document.activeElement);
    expect(document.activeElement).toBe(shown);
  });

  it("un élément focalisé mais sans offsetParent reste le premier du cycle", () => {
    const [first, , last] = setup(3, [false, true, true]);
    first.focus();
    trapFocus(container);
    first.focus();

    const event = tab(true);
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it("un élément masqué non focalisé n'est pas dans le cycle", () => {
    const [first, hidden] = setup(2, [true, false]);
    trapFocus(container);
    first.focus();

    const event = tab();
    container.dispatchEvent(event);

    // `first` est aussi le dernier élément affiché : Tab reboucle sur lui-même.
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(hidden);
  });

  it("Tab depuis le premier élément (sans Maj) ne fait rien", () => {
    const [first] = setup(3);
    trapFocus(container);
    first.focus();

    const event = tab();
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);
  });

  it("Maj+Tab au milieu ne fait rien", () => {
    const [, middle] = setup(3);
    trapFocus(container);
    middle.focus();

    const event = tab(true);
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(middle);
  });

  it("Maj+Tab depuis le dernier ne fait rien", () => {
    const [, , last] = setup(3);
    trapFocus(container);
    last.focus();

    const event = tab(true);
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("après le nettoyage, Tab depuis le dernier élément n'est plus piégé", () => {
    const [, last] = setup(2);
    const release = trapFocus(container);
    release();
    last.focus();

    const event = tab();
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(last);
  });
});
