const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/** Traps Tab/Shift+Tab focus inside `container` and restores focus to
 * whatever had it beforehand once the returned cleanup function runs. */
export function trapFocus(container: HTMLElement): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  const items = focusableElements(container);
  (items[0] ?? container).focus();

  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== "Tab") return;
    const focusable = focusableElements(container);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  container.addEventListener("keydown", onKeydown);

  return () => {
    container.removeEventListener("keydown", onKeydown);
    previouslyFocused?.focus();
  };
}
