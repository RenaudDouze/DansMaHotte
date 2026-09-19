import { renderQrSvg } from "./qr";
import { escapeHtml } from "../lib/dom";
import { icons } from "../lib/icons";
import { trapFocus } from "../lib/focusTrap";

/** Affiche le lien/QR compact d'un instantané de liste (voir
 * buildCompactShareUrl dans src/lib/importExport.ts) : contrairement à
 * openShareModal, ce lien ne donne pas accès à la liste en direct — il crée
 * une toute nouvelle liste chez qui l'ouvre. */
export function openCompactShareModal(url: string, listName: string): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal share-modal" role="dialog" aria-modal="true" tabindex="-1">
      <button class="icon-btn modal-close" aria-label="Fermer">${icons.close}</button>
      <h2>Lien compact « ${escapeHtml(listName)} »</h2>
      <p class="add-form-hint">
        Ce lien contient une copie figée de la liste (cadeaux, personnes). Il
        ne nécessite aucune connexion pour être ouvert, et ne donne pas accès
        à cette liste en direct : l'ouvrir crée une toute nouvelle liste chez
        la personne qui le reçoit.
      </p>
      <div class="qr-wrap" id="qr-wrap" aria-label="QR code du lien compact"></div>
      <p class="share-link">${escapeHtml(url)}</p>
      <div class="share-actions">
        <button class="btn primary" id="copy-compact-link">Copier le lien</button>
        ${"share" in navigator ? '<button class="btn" id="native-share-compact">Partager…</button>' : ""}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  renderQrSvg(url).then((svg) => {
    const wrap = overlay.querySelector("#qr-wrap");
    if (wrap) wrap.innerHTML = svg;
  });

  const modal = overlay.querySelector(".modal") as HTMLElement;
  const releaseFocusTrap = trapFocus(modal);

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
    releaseFocusTrap();
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKeydown);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector(".modal-close")?.addEventListener("click", close);

  overlay.querySelector("#copy-compact-link")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard API unavailable (older browser / no https), silently ignore
    }
    flash(overlay, "#copy-compact-link", "Copié !");
  });
  overlay.querySelector("#native-share-compact")?.addEventListener("click", async () => {
    try {
      await navigator.share({ title: listName, url });
    } catch {
      // user cancelled the share sheet, ignore
    }
  });
}

function flash(root: HTMLElement, selector: string, text: string): void {
  const el = root.querySelector(selector) as HTMLElement | null;
  if (!el) return;
  const original = el.textContent;
  el.textContent = text;
  setTimeout(() => {
    el.textContent = original;
  }, 1200);
}
