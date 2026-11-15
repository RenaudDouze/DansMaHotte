// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableSwipeToDelete } from "./swipe";

function pointerEvent(type: string, init: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "touch", ...init });
}

describe("enableSwipeToDelete", () => {
  let root: HTMLElement;
  let content: HTMLElement;
  let handle: HTMLElement;
  let onDelete: ReturnType<typeof vi.fn<(item: HTMLElement) => void>>;
  let dispose: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    root = document.createElement("div");
    root.innerHTML = `
      <li class="item" data-id="1">
        <button class="item-drag-handle">≡</button>
        <div class="item-content">Pommes</div>
      </li>
    `;
    document.body.appendChild(root);
    content = root.querySelector(".item-content")!;
    handle = root.querySelector(".item-drag-handle")!;
    onDelete = vi.fn<(item: HTMLElement) => void>();
    dispose = enableSwipeToDelete(root, {
      itemSelector: ".item",
      contentSelector: ".item-content",
      ignoreSelector: ".item-drag-handle",
      onDelete,
      threshold: 72,
    });
  });

  afterEach(() => {
    document.dispatchEvent(pointerEvent("pointerup"));
    dispose();
    vi.useRealTimers();
  });

  function swipe(fromX: number, toX: number, toY = 0): void {
    content.dispatchEvent(pointerEvent("pointerdown", { clientX: fromX, clientY: 0 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: toX, clientY: toY }));
  }

  it("ignore les pointeurs non tactiles (souris, stylet)", () => {
    content.dispatchEvent(pointerEvent("pointerdown", { pointerType: "mouse", clientX: 0, clientY: 0 }));
    document.dispatchEvent(pointerEvent("pointermove", { pointerType: "mouse", clientX: -50, clientY: 0 }));
    expect(content.style.transform).toBe("");
  });

  it("ignore un appui qui démarre sur un élément exclu (ex: la poignée de glisser-déposer)", () => {
    handle.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: -50, clientY: 0 }));
    expect(content.style.transform).toBe("");
  });

  it("un petit mouvement (moins de 10px) ne déclenche encore aucun suivi visuel", () => {
    swipe(0, -5);
    expect(content.style.transform).toBe("");
  });

  it("un mouvement surtout vertical est traité comme un scroll, pas un swipe", () => {
    content.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: -5, clientY: 20 }));
    expect(content.style.transform).toBe("");
    // Une fois "sorti", même un mouvement ensuite très horizontal ne reprend pas.
    document.dispatchEvent(pointerEvent("pointermove", { clientX: -80, clientY: 20 }));
    expect(content.style.transform).toBe("");
  });

  it("un swipe horizontal déplace visuellement le contenu (translateX négatif)", () => {
    swipe(0, -30);
    expect(content.style.transform).toBe("translateX(-30px)");
  });

  it("le déplacement est plafonné à 0 : impossible de glisser vers la droite", () => {
    swipe(0, 30);
    expect(content.style.transform).toBe("translateX(0px)");
  });

  it("un swipe au-delà du seuil déclenche la suppression après l'animation", () => {
    swipe(0, -100);
    document.dispatchEvent(pointerEvent("pointerup"));

    expect(content.style.transform).toBe("translateX(-100%)");
    expect(content.style.opacity).toBe("0");
    expect(onDelete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(180);
    expect(onDelete).toHaveBeenCalledWith(root.querySelector(".item"));
  });

  it("un swipe sous le seuil revient à sa position (snap-back), sans suppression", () => {
    swipe(0, -30);
    document.dispatchEvent(pointerEvent("pointerup"));

    expect(content.style.transform).toBe("");
    // jsdom ≥ 31 normalise la valeur : « ease » (défaut CSS) est omis à la relecture.
    expect(content.style.transition).toMatch(/^transform 0\.2s( ease)?$/);

    vi.advanceTimersByTime(200);
    expect(content.style.transition).toBe("");
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("un simple tap (sans dépasser le seuil de tolérance) ne déclenche ni suppression ni snap-back", () => {
    content.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    document.dispatchEvent(pointerEvent("pointerup"));

    expect(content.style.transition).toBe("");
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("le nettoyage retire l'écouteur pointerdown de la racine", () => {
    dispose();
    content.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: -30, clientY: 0 }));
    expect(content.style.transform).toBe("");
  });

  it("utilise un seuil par défaut de 72px si aucun n'est fourni", () => {
    dispose();
    dispose = enableSwipeToDelete(root, {
      itemSelector: ".item",
      contentSelector: ".item-content",
      ignoreSelector: ".item-drag-handle",
      onDelete,
    });

    swipe(0, -80); // au-delà de 72, en-deçà des 100 utilisés par le test dédié au seuil
    document.dispatchEvent(pointerEvent("pointerup"));
    vi.advanceTimersByTime(180);

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("ignore un appui qui ne trouve aucun ancêtre .item du tout", () => {
    // À l'intérieur de root (sinon le pointerdown ne bubble même pas jusqu'à
    // son écouteur) mais sans aucun ancêtre .item, même au-dessus de root.
    const stray = document.createElement("div");
    root.appendChild(stray);

    stray.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: -30, clientY: 0 }));

    expect(content.style.transform).toBe("");
  });

  it("ignore un appui trouvé hors du conteneur racine", () => {
    // Un simple dispatch en dehors de root ne ferait même pas remonter
    // l'évènement jusqu'à son écouteur ; on place plutôt root lui-même sous
    // un .item pour que closest() trouve un élément non contenu dans root.
    const outerItem = document.createElement("li");
    outerItem.className = "item";
    document.body.appendChild(outerItem);
    outerItem.appendChild(root);
    const bare = document.createElement("div");
    root.appendChild(bare);

    bare.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    document.dispatchEvent(pointerEvent("pointermove", { clientX: -30, clientY: 0 }));

    expect(content.style.transform).toBe("");
  });

  it("ignore un article qui n'a pas l'élément de contenu attendu", () => {
    const bareItem = document.createElement("li");
    bareItem.className = "item";
    root.appendChild(bareItem);

    expect(() => {
      bareItem.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
      document.dispatchEvent(pointerEvent("pointermove", { clientX: -30, clientY: 0 }));
    }).not.toThrow();
  });

  it("une fois le swipe engagé, les mouvements suivants s'appliquent directement (sans re-vérifier la tolérance/direction)", () => {
    swipe(0, -30); // engage le swipe (dépasse la tolérance de 10px, horizontal)
    expect(content.style.transform).toBe("translateX(-30px)");

    // Un mouvement ensuite très vertical, qui aurait été ignoré s'il avait
    // démarré l'interaction, continue de s'appliquer une fois déjà engagé.
    document.dispatchEvent(pointerEvent("pointermove", { clientX: -35, clientY: 50 }));
    expect(content.style.transform).toBe("translateX(-35px)");
  });

  describe("détails du geste", () => {
    const down = (x: number, y: number) => content.dispatchEvent(pointerEvent("pointerdown", { clientX: x, clientY: y }));
    const move = (x: number, y: number) => document.dispatchEvent(pointerEvent("pointermove", { clientX: x, clientY: y }));

    it("mesure le déplacement depuis le point d'appui, en X comme en Y", () => {
      down(100, 100);
      move(40, 100);
      expect(content.style.transform).toBe("translateX(-60px)");
    });

    it("un déplacement horizontal d'exactement 10px engage déjà le geste", () => {
      down(0, 0);
      move(-10, 0);
      expect(content.style.transform).toBe("translateX(-10px)");
    });

    it("un déplacement vertical d'exactement 10px sort du geste", () => {
      down(0, 0);
      move(0, 10);
      move(-50, 0);
      expect(content.style.transform).toBe("");
    });

    it("à déplacements X et Y égaux, le geste reste horizontal", () => {
      down(0, 0);
      move(-15, 15);
      expect(content.style.transform).toBe("translateX(-15px)");
    });

    it("bloque le défilement natif une fois le geste engagé", () => {
      down(0, 0);
      const event = pointerEvent("pointermove", { clientX: -30, clientY: 0 });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it("écoute pointermove en mode non passif", () => {
      const add = vi.spyOn(document, "addEventListener");
      down(0, 0);
      expect(add.mock.calls.find(([type]) => type === "pointermove")?.[2]).toStrictEqual({ passive: false });
      add.mockRestore();
    });

    it("ne démarre rien si la ligne n'a pas d'élément à faire glisser", () => {
      const bare = document.createElement("li");
      bare.className = "item";
      root.appendChild(bare);
      const add = vi.spyOn(document, "addEventListener");
      bare.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
      expect(add).not.toHaveBeenCalled();
      add.mockRestore();
    });

    it("retire ses trois écouteurs à la fin du geste", () => {
      const remove = vi.spyOn(document, "removeEventListener");
      down(0, 0);
      document.dispatchEvent(pointerEvent("pointerup"));
      const types = remove.mock.calls.map(([type]) => type);
      expect(types).toEqual(expect.arrayContaining(["pointermove", "pointerup", "pointercancel"]));
      remove.mockRestore();
    });

    it("un pointercancel termine le geste comme un relâchement", () => {
      down(0, 0);
      move(-30, 0);
      document.dispatchEvent(pointerEvent("pointercancel"));
      expect(content.style.transition).toBe("transform 0.2s");
      expect(content.style.transform).toBe("");
    });

    it("supprime à partir du seuil exact, avec l'animation de sortie", () => {
      down(0, 0);
      move(-72, 0);
      document.dispatchEvent(pointerEvent("pointerup"));
      expect(content.style.transition).toBe("transform 0.18s, opacity 0.18s");
      vi.advanceTimersByTime(180);
      expect(onDelete).toHaveBeenCalledOnce();
    });

    it("un geste annulé ne laisse pas de mouvement résiduel pour le suivant", () => {
      down(0, 0);
      move(-80, 0);
      document.dispatchEvent(pointerEvent("pointerup"));
      vi.advanceTimersByTime(180);
      onDelete.mockClear();
      down(0, 0);
      document.dispatchEvent(pointerEvent("pointerup"));
      vi.advanceTimersByTime(500);
      expect(onDelete).not.toHaveBeenCalled();
    });
  });
});
