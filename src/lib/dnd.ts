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
  // Le pointeur peut émettre bien plus d'événements que d'images affichées
  // (surtout au toucher) ; on ne garde que la position la plus récente et on
  // ne fait le travail coûteux (elementFromPoint + déplacement DOM, donc
  // reflow) qu'une fois par frame, plutôt qu'à chaque pointermove.
  let rafId: number | null = null;
  let pendingX = 0;
  let pendingY = 0;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== undefined && e.button !== 0) return;
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
    if (!dragEl) return;
    e.preventDefault();
    pendingX = e.clientX;
    pendingY = e.clientY;
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        applyMove(pendingX, pendingY);
      });
    }
  }

  function applyMove(clientX: number, clientY: number) {
    if (!dragEl) return;
    const prevPointerEvents = dragEl.style.pointerEvents;
    dragEl.style.pointerEvents = "none";
    const overEl = document.elementFromPoint(clientX, clientY);
    dragEl.style.pointerEvents = prevPointerEvents;
    if (!overEl) return;

    const container = overEl.closest<HTMLElement>(opts.containerSelector);
    if (!container || !root.contains(container)) return;

    const overItem = overEl.closest(opts.itemSelector) as HTMLElement | null;
    if (overItem && overItem !== dragEl && container.contains(overItem)) {
      const rect = overItem.getBoundingClientRect();
      const before = clientY < rect.top + rect.height / 2;
      container.insertBefore(dragEl, before ? overItem : overItem.nextSibling);
    } else if (!overItem && !container.contains(dragEl)) {
      container.appendChild(dragEl);
    }
  }

  function onPointerUp() {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
    if (rafId !== null) {
      // Applique tout de suite le dernier déplacement en attente plutôt que
      // de l'abandonner : sinon le dernier pointermove avant le relâchement
      // (souvent le plus significatif) pourrait ne jamais être pris en
      // compte si aucune frame ne s'est encore écoulée entre les deux.
      cancelAnimationFrame(rafId);
      rafId = null;
      applyMove(pendingX, pendingY);
    }
    const el = dragEl;
    dragEl = null;
    if (el) {
      el.classList.remove("dragging");
      opts.onDrop(el);
    }
  }

  root.addEventListener("pointerdown", onPointerDown);
  return () => root.removeEventListener("pointerdown", onPointerDown);
}
