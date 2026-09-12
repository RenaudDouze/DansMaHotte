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
    const prevPointerEvents = dragEl.style.pointerEvents;
    dragEl.style.pointerEvents = "none";
    const overEl = document.elementFromPoint(e.clientX, e.clientY);
    dragEl.style.pointerEvents = prevPointerEvents;
    if (!overEl) return;

    const container = overEl.closest<HTMLElement>(opts.containerSelector);
    if (!container || !root.contains(container)) return;

    const overItem = overEl.closest(opts.itemSelector) as HTMLElement | null;
    if (overItem && overItem !== dragEl && container.contains(overItem)) {
      const rect = overItem.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      container.insertBefore(dragEl, before ? overItem : overItem.nextSibling);
    } else if (!overItem && !container.contains(dragEl)) {
      container.appendChild(dragEl);
    }
  }

  function onPointerUp() {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
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
