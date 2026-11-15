// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableDragReorder } from "./dnd";

// jsdom n'a ni layout réel ni document.elementFromPoint (absent, pas juste
// renvoyant null) : on le fournit nous-mêmes, comme un vrai navigateur le
// ferait via un hit-test sur la position pointeur.
function stubElementFromPoint(el: Element | null): void {
  (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = () => el;
}

function stubRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON() {
      return this;
    },
    ...rect,
  });
}

function pointerEvent(type: string, init: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
}

// requestAnimationFrame planifie réellement de façon asynchrone dans un
// navigateur : un stub qui exécute le callback de façon synchrone, *pendant*
// l'appel, court-circuite l'affectation `rafId = requestAnimationFrame(cb)`
// du code source (le callback remet rafId à null avant même que
// l'affectation externe ne s'exécute). On sépare donc planification et
// exécution, pilotées explicitement par flushRaf() dans les tests.
let pendingFrame: FrameRequestCallback | null = null;
const cancelAnimationFrame = vi.fn((_id: number) => {
  pendingFrame = null;
});

function flushRaf(): void {
  const cb = pendingFrame;
  pendingFrame = null;
  cb?.(0);
}

describe("enableDragReorder", () => {
  let root: HTMLElement;
  let onDrop: ReturnType<typeof vi.fn<(draggedEl: HTMLElement) => void>>;
  let dispose: () => void;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    root.innerHTML = `
      <ul class="item-list" data-category-id="a">
        <li class="item" data-id="1"><button class="drag-handle">≡</button>Pommes</li>
        <li class="item" data-id="2"><button class="drag-handle">≡</button>Poires</li>
      </ul>
      <ul class="item-list" data-category-id="b"></ul>
    `;
    document.body.appendChild(root);
    onDrop = vi.fn<(draggedEl: HTMLElement) => void>();
    pendingFrame = null;
    cancelAnimationFrame.mockClear();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
      pendingFrame = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    dispose = enableDragReorder(root, { containerSelector: ".item-list", itemSelector: ".item", handleSelector: ".drag-handle", onDrop });
  });

  afterEach(() => {
    // Referme tout glisser resté ouvert dans le test (sinon les écouteurs
    // document.addEventListener("pointermove"/"pointerup"...) posés par
    // onPointerDown fuient vers les tests suivants) — sans effet si le test
    // avait déjà relâché normalement.
    document.dispatchEvent(pointerEvent("pointerup"));
    dispose();
    delete (document as unknown as Record<string, unknown>).elementFromPoint;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function handle(index: number): HTMLElement {
    return root.querySelectorAll<HTMLElement>(".drag-handle")[index];
  }

  function item(index: number): HTMLElement {
    return root.querySelectorAll<HTMLElement>(".item")[index];
  }

  it("ignore un clic qui n'est pas le bouton principal", () => {
    handle(0).dispatchEvent(pointerEvent("pointerdown", { button: 1 }));
    expect(item(0).classList.contains("dragging")).toBe(false);
  });

  it("ignore un pointerdown hors de la poignée de glisser-déposer", () => {
    item(0).dispatchEvent(pointerEvent("pointerdown"));
    expect(item(0).classList.contains("dragging")).toBe(false);
  });

  it("ignore une poignée sans article ancêtre (itemSelector ne matche pas)", () => {
    const looseHandle = document.createElement("button");
    looseHandle.className = "drag-handle";
    root.appendChild(looseHandle); // pas dans un .item
    looseHandle.dispatchEvent(pointerEvent("pointerdown"));
    expect(item(0).classList.contains("dragging")).toBe(false);
  });

  it("démarre le glisser sur un appui de la poignée : classe dragging, empêche le comportement par défaut", () => {
    const event = pointerEvent("pointerdown");
    const preventDefault = vi.spyOn(event, "preventDefault");
    handle(0).dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(item(0).classList.contains("dragging")).toBe(true);
  });

  it("déplace l'article avant celui survolé si le pointeur est dans sa moitié haute", () => {
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    stubRect(item(1), { top: 0, height: 40 });
    stubElementFromPoint(item(1));

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 5 }));
    flushRaf();

    const ids = Array.from(root.querySelectorAll(".item")).map((el) => el.getAttribute("data-id"));
    expect(ids[0]).toBe("1");
  });

  it("déplace l'article après celui survolé si le pointeur est dans sa moitié basse", () => {
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    stubRect(item(1), { top: 0, height: 40 });
    stubElementFromPoint(item(1));

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 35 }));
    flushRaf();

    const ids = Array.from(root.querySelectorAll(".item")).map((el) => el.getAttribute("data-id"));
    expect(ids).toEqual(["2", "1"]);
  });

  it("dépose l'article dans un conteneur vide quand aucun article n'est survolé", () => {
    const emptyContainer = root.querySelectorAll(".item-list")[1] as HTMLElement;
    const dragged = item(0);
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    stubElementFromPoint(emptyContainer);

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    flushRaf();

    expect(emptyContainer.contains(dragged)).toBe(true);
  });

  it("ne fait rien si le hit-test ne trouve aucun élément (survol hors de l'app)", () => {
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    stubElementFromPoint(null);

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    expect(() => flushRaf()).not.toThrow();
  });

  it("ne fait rien si le hit-test tombe hors du conteneur racine", () => {
    const outside = document.createElement("div");
    outside.className = "item-list";
    document.body.appendChild(outside);
    const dragged = item(0);
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    stubElementFromPoint(outside);

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    flushRaf();

    expect(root.contains(dragged)).toBe(true);
    expect(outside.contains(dragged)).toBe(false);
  });

  it("le relâchement retire la classe et notifie onDrop", () => {
    handle(0).dispatchEvent(pointerEvent("pointerdown"));

    document.dispatchEvent(pointerEvent("pointerup"));

    expect(item(0).classList.contains("dragging")).toBe(false);
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith(item(0));
  });

  it("le relâchement applique un déplacement resté en attente (frame pas encore rendue)", () => {
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    stubRect(item(1), { top: 0, height: 40 });
    stubElementFromPoint(item(1));
    // Moitié basse de item(1) (id=2) : déplace id=1 après lui, un changement
    // réellement visible (contrairement à "avant", où id=1 précède déjà id=2).
    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 35 }));
    // Ne flush pas la frame : elle n'a "pas encore été rendue" au relâchement.
    expect(Array.from(root.querySelectorAll(".item")).map((el) => el.getAttribute("data-id"))).toEqual(["1", "2"]);

    document.dispatchEvent(pointerEvent("pointerup"));

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    const ids = Array.from(root.querySelectorAll(".item")).map((el) => el.getAttribute("data-id"));
    expect(ids).toEqual(["2", "1"]);
  });

  it("ne programme qu'une seule frame même si le pointeur bouge plusieurs fois avant qu'elle s'exécute", () => {
    const raf = vi.fn((cb: FrameRequestCallback): number => {
      pendingFrame = cb;
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    // Requis par afterEach (pointerup force-résolu) : traite le mouvement en
    // attente via processPendingMove, qui a besoin d'un hit-test.
    stubElementFromPoint(item(1));
    handle(0).dispatchEvent(pointerEvent("pointerdown"));

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 1 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 2 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 3 }));

    expect(raf).toHaveBeenCalledOnce();
  });

  it("une frame en retard qui s'exécute après la fin du glisser ne fait rien (le drop l'a déjà traitée puis effacée)", () => {
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    stubElementFromPoint(item(1));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    const staleCallback = pendingFrame; // capturé avant que le relâchement ne l'efface
    document.dispatchEvent(pointerEvent("pointerup")); // traite ce déplacement puis efface dragEl

    expect(() => staleCallback?.(0)).not.toThrow();
  });

  it("survoler son propre conteneur sans survoler un article ne fait rien (déjà à sa place)", () => {
    const firstContainer = root.querySelectorAll(".item-list")[0] as HTMLElement;
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    stubElementFromPoint(firstContainer); // le conteneur lui-même, pas un article

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    flushRaf();

    const ids = Array.from(root.querySelectorAll(".item")).map((el) => el.getAttribute("data-id"));
    expect(ids).toEqual(["1", "2"]);
  });

  it("le nettoyage retire l'écouteur pointerdown de la racine", () => {
    dispose();
    const event = pointerEvent("pointerdown");
    const preventDefault = vi.spyOn(event, "preventDefault");
    handle(0).dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });
  it("accepte uniquement le bouton principal (0)", () => {
    handle(0).dispatchEvent(pointerEvent("pointerdown", { button: 2 }));
    expect(item(0).classList.contains("dragging")).toBe(false);
  });

  it("ignore une poignée trouvée hors de la racine (ancêtre de la racine)", () => {
    const outerItem = document.createElement("div");
    outerItem.className = "item";
    const outerHandle = document.createElement("div");
    outerHandle.className = "drag-handle";
    const nestedRoot = document.createElement("div");
    nestedRoot.innerHTML = "<span>contenu</span>";
    outerHandle.appendChild(nestedRoot);
    outerItem.appendChild(outerHandle);
    document.body.appendChild(outerItem);
    const nestedDispose = enableDragReorder(nestedRoot, { containerSelector: ".item-list", itemSelector: ".item", handleSelector: ".drag-handle", onDrop });

    nestedRoot.querySelector("span")!.dispatchEvent(pointerEvent("pointerdown"));

    expect(outerItem.classList.contains("dragging")).toBe(false);
    nestedDispose();
  });

  it("capture le pointeur sur la poignée", () => {
    const setPointerCapture = vi.fn();
    handle(0).setPointerCapture = setPointerCapture;
    const event = pointerEvent("pointerdown");
    Object.defineProperty(event, "pointerId", { value: 7 });

    handle(0).dispatchEvent(event);

    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });

  it("écoute pointermove en mode non passif (pour pouvoir bloquer le scroll)", () => {
    const add = vi.spyOn(document, "addEventListener");
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    const call = add.mock.calls.find(([type]) => type === "pointermove");
    expect(call?.[2]).toStrictEqual({ passive: false });
  });

  it("empêche le comportement par défaut à chaque pointermove", () => {
    stubElementFromPoint(item(1));
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    const move = pointerEvent("pointermove", { clientX: 0, clientY: 0 });
    document.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
  });

  it("un pointercancel termine le glisser comme un pointerup, une seule fois", () => {
    handle(0).dispatchEvent(pointerEvent("pointerdown"));

    document.dispatchEvent(pointerEvent("pointercancel"));
    expect(onDrop).toHaveBeenCalledOnce();
    expect(item(0).classList.contains("dragging")).toBe(false);

    // Plus aucun écouteur : un nouveau pointercancel/pointerup ne fait rien.
    document.dispatchEvent(pointerEvent("pointercancel"));
    document.dispatchEvent(pointerEvent("pointerup"));
    expect(onDrop).toHaveBeenCalledOnce();
  });

  it("après le relâchement, un pointermove ne planifie plus rien", () => {
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    document.dispatchEvent(pointerEvent("pointerup"));
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 0 }));

    expect(raf).not.toHaveBeenCalled();
  });

  it("désactive les événements pointeur de l'article déplacé pendant le hit-test, puis les rétablit", () => {
    const dragged = item(0);
    dragged.style.pointerEvents = "auto";
    let during = "";
    (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () => {
      during = dragged.style.pointerEvents;
      return item(1);
    };
    handle(0).dispatchEvent(pointerEvent("pointerdown"));

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    flushRaf();

    expect(during).toBe("none");
    expect(dragged.style.pointerEvents).toBe("auto");
  });

  it("ne déplace rien si le hit-test tombe sur un élément sans conteneur", () => {
    const dragged = item(0);
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    stubElementFromPoint(document.body);

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 0 }));

    expect(() => flushRaf()).not.toThrow();
    expect(item(0)).toBe(dragged);
  });

  it("survoler l'article déplacé lui-même ne change pas l'ordre", () => {
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    stubRect(item(0), { top: 0, height: 40 });
    stubElementFromPoint(item(0));

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 35 }));
    flushRaf();

    expect(Array.from(root.querySelectorAll(".item")).map((el) => el.getAttribute("data-id"))).toEqual(["1", "2"]);
  });

  it("au milieu exact d'un article, insère après lui", () => {
    handle(1).dispatchEvent(pointerEvent("pointerdown"));
    stubRect(item(0), { top: 0, height: 40 });
    stubElementFromPoint(item(0));

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 20 }));
    flushRaf();

    expect(Array.from(root.querySelectorAll(".item")).map((el) => el.getAttribute("data-id"))).toEqual(["1", "2"]);
  });

  it("ignore un article survolé qui n'est pas dans le conteneur survolé", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "item";
    wrapper.innerHTML = '<ul class="item-list"><li class="inner">x</li></ul>';
    root.appendChild(wrapper);
    const inner = wrapper.querySelector(".inner")!;
    const dragged = item(0);
    handle(0).dispatchEvent(pointerEvent("pointerdown"));
    stubElementFromPoint(inner);

    document.dispatchEvent(pointerEvent("pointermove", { clientX: 0, clientY: 0 }));

    expect(() => flushRaf()).not.toThrow();
    expect(dragged.parentElement).toBe(root.querySelectorAll(".item-list")[0]);
  });
});
