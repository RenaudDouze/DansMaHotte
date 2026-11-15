// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startEdit } from "./editable";

describe("startEdit", () => {
  let el: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    el = document.createElement("span");
    el.textContent = "Pommes";
    document.body.appendChild(el);
  });

  it("remplace l'élément par un input pré-rempli, focus et sélectionné", () => {
    startEdit(el, { value: "Pommes", onCommit: vi.fn() });

    const input = el.querySelector("input")!;
    expect(input).not.toBeNull();
    expect(input.type).toBe("text");
    expect(input.className).toBe("inline-edit");
    expect(input.value).toBe("Pommes");
    expect(document.activeElement).toBe(input);
  });

  it("pose le placeholder si fourni", () => {
    startEdit(el, { value: "", placeholder: "ex: 2, 500 g", onCommit: vi.fn() });
    expect(el.querySelector("input")!.placeholder).toBe("ex: 2, 500 g");
  });

  it("ne fait rien si un input est déjà présent (édition déjà en cours)", () => {
    startEdit(el, { value: "Pommes", onCommit: vi.fn() });
    const firstInput = el.querySelector("input");
    startEdit(el, { value: "Autre chose", onCommit: vi.fn() });
    expect(el.querySelector("input")).toBe(firstInput);
  });

  it("Entrée déclenche le blur, qui valide la valeur (recadrée)", () => {
    const onCommit = vi.fn();
    startEdit(el, { value: "Pommes", onCommit });
    const input = el.querySelector("input")!;
    input.value = "  Poires  ";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(document.activeElement).not.toBe(input);
    expect(onCommit).toHaveBeenCalledWith("Poires");
  });

  it("Échap valide la valeur d'origine, pas la saisie en cours", () => {
    const onCommit = vi.fn();
    startEdit(el, { value: "Pommes", onCommit });
    const input = el.querySelector("input")!;
    input.value = "Autre chose";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(onCommit).toHaveBeenCalledWith("Pommes");
  });

  it("ignore les autres touches", () => {
    const onCommit = vi.fn();
    startEdit(el, { value: "Pommes", onCommit });
    const input = el.querySelector("input")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ne valide qu'une seule fois même si blur et Échap se déclenchent tous les deux", () => {
    const onCommit = vi.fn();
    startEdit(el, { value: "Pommes", onCommit });
    const input = el.querySelector("input")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event("blur"));
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("un clic dans l'input ne remonte pas au parent (ne referme pas un menu englobant)", () => {
    const parentClick = vi.fn();
    document.body.addEventListener("click", parentClick);
    startEdit(el, { value: "Pommes", onCommit: vi.fn() });
    el.querySelector("input")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("crée un champ de type texte, sans placeholder si non fourni", () => {
    startEdit(el, { value: "Pommes", onCommit: vi.fn() });
    const input = el.querySelector("input")!;
    expect(input.getAttribute("type")).toBe("text");
    expect(input.placeholder).toBe("");
  });

  it("sélectionne tout le texte à l'ouverture", () => {
    startEdit(el, { value: "Pommes", onCommit: vi.fn() });
    const input = el.querySelector("input")!;
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(6);
  });

  it("Entrée et Échap bloquent l'action par défaut du navigateur", () => {
    startEdit(el, { value: "Pommes", onCommit: vi.fn() });
    const input = el.querySelector("input")!;
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);

    el.replaceChildren();
    startEdit(el, { value: "Pommes", onCommit: vi.fn() });
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    el.querySelector("input")!.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
  });

  it("deux blur successifs ne valident qu'une fois", () => {
    const onCommit = vi.fn();
    startEdit(el, { value: "Pommes", onCommit });
    const input = el.querySelector("input")!;
    input.dispatchEvent(new Event("blur"));
    input.dispatchEvent(new Event("blur"));
    expect(onCommit).toHaveBeenCalledOnce();
  });
});
