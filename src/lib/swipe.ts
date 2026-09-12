export interface SwipeToDeleteOptions {
  /** Selector (relative to root) of the swipeable row — carries whatever
   * data-* attribute onDelete needs (e.g. an id). */
  itemSelector: string;
  /** Selector (within the row) of the element that actually slides, kept
   * separate from itemSelector so a background (e.g. a delete icon) can be
   * revealed behind it as it moves. */
  contentSelector: string;
  /** A swipe never starts inside one of these (a drag handle with its own
   * gesture, a checkbox, a button…). */
  ignoreSelector: string;
  onDelete: (item: HTMLElement) => void;
  /** Minimum leftward distance (px) to commit to a delete. Default 72. */
  threshold?: number;
}

/** Lightweight "swipe left to delete" for touch devices, delegated from a
 * root container so it survives re-renders without re-wiring each row.
 * Mouse/pen pointers are ignored — desktop keeps the existing tap-to-confirm
 * delete button. A short horizontal-vs-vertical tolerance keeps a plain tap
 * (to check an item, edit its name…) or a vertical scroll from being
 * mistaken for a swipe. */
export function enableSwipeToDelete(root: HTMLElement, opts: SwipeToDeleteOptions): () => void {
  const threshold = opts.threshold ?? 72;
  let item: HTMLElement | null = null;
  let content: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;
  let committed = false;

  function snapBack(el: HTMLElement) {
    el.style.transition = "transform 0.2s ease";
    el.style.transform = "";
    setTimeout(() => {
      el.style.transition = "";
    }, 200);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    const target = e.target as HTMLElement;
    if (target.closest(opts.ignoreSelector)) return;
    const el = target.closest(opts.itemSelector) as HTMLElement | null;
    if (!el || !root.contains(el)) return;
    const contentEl = el.querySelector(opts.contentSelector) as HTMLElement | null;
    if (!contentEl) return;
    item = el;
    content = contentEl;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    tracking = true;
    committed = false;
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    if (!tracking || !content) return;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    if (!committed) {
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        // Vertical scroll: bow out of this interaction entirely.
        tracking = false;
        return;
      }
      committed = true;
    }
    e.preventDefault();
    dx = Math.min(0, deltaX);
    content.style.transform = `translateX(${dx}px)`;
  }

  function onPointerUp() {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
    const el = item;
    const contentEl = content;
    const wasCommitted = committed;
    const finalDx = dx;
    tracking = false;
    committed = false;
    item = null;
    content = null;
    if (!el || !contentEl || !wasCommitted) return;
    if (finalDx <= -threshold) {
      contentEl.style.transition = "transform 0.18s ease, opacity 0.18s ease";
      contentEl.style.transform = "translateX(-100%)";
      contentEl.style.opacity = "0";
      setTimeout(() => opts.onDelete(el), 180);
    } else {
      snapBack(contentEl);
    }
  }

  root.addEventListener("pointerdown", onPointerDown);
  return () => root.removeEventListener("pointerdown", onPointerDown);
}
