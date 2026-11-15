export interface DragReorderOptions {
  containerSelector: string;
  itemSelector: string;
  handleSelector: string;
  onDrop: (draggedEl: HTMLElement) => void;
}

/** Lightweight pointer-based drag-to-reorder, supports moving items between
 * sibling containers that match `containerSelector` (used to drag shopping
 * items between recipient groups). No external dependency. */
export function enableDragReorder(root: HTMLElement, opts: DragReorderOptions): () => void {
  let dragEl: HTMLElement | null = null;
  // elementFromPoint()/getBoundingClientRect() forcent un reflow ; les
  // limiter à une fois par frame (au lieu d'une fois par pointermove, qui
  // peut arriver bien plus souvent) évite de refaire ce travail pour rien
  // entre deux peintures. e.preventDefault() reste appelé à chaque event
  // (nécessaire tout de suite pour bloquer le scroll tactile pendant le
  // glisser), seul le hit-test/déplacement DOM est différé.
  let rafId: number | null = null;
  let pendingX = 0;
  let pendingY = 0;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.closest(opts.handleSelector) as HTMLElement | null;
    if (!handle || !root.contains(handle)) return;
    const item = handle.closest(opts.itemSelector) as HTMLElement | null;
    if (!item) return;

    e.preventDefault();
    dragEl = item;
    item.classList.add("dragging");
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    // Écouteur document ajouté par onPointerDown juste après avoir affecté
    // dragEl, et retiré par onPointerUp en tout premier : ne peut donc se
    // déclencher que pendant un glisser actif (dragEl non nul).
    e.preventDefault();
    pendingX = e.clientX;
    pendingY = e.clientY;
    if (rafId === null) rafId = requestAnimationFrame(processPendingMove);
  }

  function processPendingMove() {
    rafId = null;
    if (!dragEl) return;
    const prevPointerEvents = dragEl.style.pointerEvents;
    dragEl.style.pointerEvents = "none";
    const overEl = document.elementFromPoint(pendingX, pendingY);
    dragEl.style.pointerEvents = prevPointerEvents;
    if (!overEl) return;

    const container = overEl.closest<HTMLElement>(opts.containerSelector)!;
    // `root.contains(null)` vaut faux : un survol hors de tout conteneur
    // s'arrête ici, `container` est donc non nul au-delà.
    if (!root.contains(container)) return;

    const overItem = overEl.closest(opts.itemSelector) as HTMLElement | null;
    // Survoler l'article déplacé lui-même ne change rien (insertBefore(x, x)
    // est sans effet) ; `contains(null)` vaut faux quand aucun article n'est survolé.
    if (container.contains(overItem)) {
      const rect = overItem!.getBoundingClientRect();
      const before = pendingY < rect.top + rect.height / 2;
      container.insertBefore(dragEl, before ? overItem : overItem!.nextSibling);
    } else if (!overItem && !container.contains(dragEl)) {
      container.appendChild(dragEl);
    }
  }

  function onPointerUp() {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
    // Un déplacement en attente doit être appliqué avant le drop, pas
    // simplement annulé : sinon la dernière position (potentiellement à
    // peine plus tôt qu'une frame) n'aurait jamais son effet.
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      processPendingMove();
    }
    // onPointerUp ne peut s'exécuter que via les écouteurs posés par
    // onPointerDown juste après avoir affecté dragEl, et il les retire lui-
    // même en tout premier (ci-dessus) : dragEl est donc garanti non nul ici.
    const el = dragEl!;
    dragEl = null;
    el.classList.remove("dragging");
    opts.onDrop(el);
  }

  root.addEventListener("pointerdown", onPointerDown);
  return () => root.removeEventListener("pointerdown", onPointerDown);
}
