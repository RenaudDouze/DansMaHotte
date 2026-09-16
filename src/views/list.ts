import type { Recipient, Item, ListState, GiftStatus } from "../../shared/types";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, GIFT_STATUSES, GIFT_STATUS_LABELS } from "../../shared/types";
import { ListConnection } from "../lib/ws";
import { fetchListState, itemImageUrl, uploadItemImage, deleteItemImage } from "../lib/http";
import { cacheListState, getCachedListState, touchRecentList } from "../lib/storage";
import { uid } from "../lib/id";
import { escapeHtml } from "../lib/dom";
import { startEdit } from "../lib/editable";
import { wireConfirmClick } from "../lib/confirmClick";
import { enableDragReorder } from "../lib/dnd";
import { enableSwipeToDelete } from "../lib/swipe";
import { openShareModal } from "../components/shareModal";
import { openAccessibilityModal } from "../components/accessibilityModal";
import { exportListState, parseImportFile } from "../lib/importExport";
import { icons } from "../lib/icons";
import { trapFocus } from "../lib/focusTrap";
import { resolveRecipientHue } from "../lib/color";
import { alnumCompare } from "../lib/sort";
import { cycleThemePreference, getThemePreference, themeLabel, type ThemePreference } from "../lib/theme";
import { cycleItemSortPreference, getItemSortPreference, itemSortLabel } from "../lib/itemSortPreference";
import { getHideCheckedPreference, toggleHideCheckedPreference } from "../lib/hideCheckedPreference";
import { privacyHint } from "../lib/privacyHint";

const THEME_ICON: Record<ThemePreference, string> = { system: icons.themeAuto, light: icons.sun, dark: icons.moon };

// Palette de teintes proposées pour la couleur manuelle d'un destinataire
// (voir colorPaletteHtml) — un choix curé plutôt qu'un sélecteur de couleur
// libre, pour rester cohérent avec le rendu HSL (saturation/luminosité
// fixes) utilisé partout ailleurs pour l'accent de couleur automatique.
const RECIPIENT_COLOR_HUES: readonly { hue: number; name: string }[] = [
  { hue: 0, name: "Rouge" },
  { hue: 30, name: "Orange" },
  { hue: 60, name: "Jaune" },
  { hue: 90, name: "Citron vert" },
  { hue: 120, name: "Vert" },
  { hue: 150, name: "Émeraude" },
  { hue: 180, name: "Turquoise" },
  { hue: 210, name: "Bleu ciel" },
  { hue: 240, name: "Bleu" },
  { hue: 270, name: "Indigo" },
  { hue: 300, name: "Violet" },
  { hue: 330, name: "Rose" },
];

// Item sans status explicite (créé avant l'introduction du champ) : traité
// comme "Idée", pour ne rien changer à l'ordre existant.
const statusOf = (item: Item): GiftStatus => item.status ?? "idee";

// Une couleur par statut, du même esprit que sur OnMangeQuoi : un repère
// visuel immédiat sans avoir à relire le libellé.
const GIFT_STATUS_COLORS: Record<GiftStatus, string> = {
  idee: "#8d8177",
  sur: "#c96a2e",
  achete: "#2f9e52",
  commande: "#7c5cbf",
  recu: "#3b6ea5",
  a_plusieurs: "#2b8f86",
  emballe: "var(--favorite)",
};

/** Format d'affichage français : "12,50 €" (toujours 2 décimales). */
function formatPrice(price: number): string {
  return `${price.toFixed(2).replace(".", ",")} €`;
}

/** Lit la saisie libre d'un champ prix (virgule ou point comme séparateur
 * décimal). `null` = champ vidé volontairement (efface le prix) ;
 * `undefined` = saisie invalide, à rejeter sans rien envoyer au serveur
 * (qui revalide de toute façon, voir worker/reducer.ts). */
function parsePriceInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number.parseFloat(trimmed.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100) / 100;
}

function colorPaletteHtml(recipient: Recipient): string {
  const autoSelected = recipient.color === undefined;
  const autoSwatch = `<button type="button" class="color-swatch color-swatch-auto${autoSelected ? " selected" : ""}" data-color="auto" aria-label="Couleur automatique" aria-pressed="${autoSelected}">Auto</button>`;
  const hueSwatches = RECIPIENT_COLOR_HUES.map(({ hue, name }) => {
    const selected = recipient.color === hue;
    return `<button type="button" class="color-swatch${selected ? " selected" : ""}" data-color="${hue}" style="--swatch-hue: ${hue}" aria-label="${name}" aria-pressed="${selected}"></button>`;
  }).join("");
  return `<div class="color-palette">${autoSwatch}${hueSwatches}</div>`;
}

/** Affiche une image en plein écran (clic sur une miniature) : overlay
 * sombre, fermeture au clic sur le fond ou l'image elle-même, sur Échap, ou
 * sur le bouton fermer. Un bouton supprimer (armé en deux clics, comme le
 * reste des suppressions de l'app) est proposé à côté. */
function openImageLightbox(url: string, alt: string, onDelete: () => void): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay image-lightbox-overlay";
  overlay.innerHTML = `
    <button type="button" class="icon-btn image-lightbox-delete" aria-label="Supprimer la photo">${icons.trash}</button>
    <button type="button" class="icon-btn image-lightbox-close" aria-label="Fermer">${icons.close}</button>
    <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" class="image-lightbox-img" />
  `;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
  };
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  overlay.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target === overlay || target.tagName === "IMG") close();
  });
  document.addEventListener("keydown", onKeydown);
  overlay.querySelector(".image-lightbox-close")?.addEventListener("click", close);
  wireConfirmClick(overlay.querySelector<HTMLButtonElement>(".image-lightbox-delete")!, {
    armedLabel: "Confirmer la suppression de la photo",
    onConfirm: () => {
      close();
      onDelete();
    },
  });
}

export function mountListView(root: HTMLElement, code: string, navigate: (path: string) => void): () => void {
  let state: ListState | null = getCachedListState(code);
  let connected = false;
  let loading = state === null;
  let notFound = false;
  let loadError = false;
  let disposeItemDnd: (() => void) | null = null;
  let disposeRecipientDnd: (() => void) | null = null;
  let disposeSwipe: (() => void) | null = null;
  // Le popover de statut ouvert, le cas échéant (voir openStatusPicker plus
  // bas) — déclaré ici, avant le tout premier rendu synchrone (qui peut déjà
  // afficher des cadeaux si une liste est en cache local), pour éviter une
  // erreur de zone morte temporelle : ce même rendu appelle closeStatusPicker
  // dès renderRecipients.
  let activeStatusPicker: { anchor: HTMLElement; panel: HTMLElement; cleanup: () => void } | null = null;
  // Même popover flottant que activeStatusPicker ci-dessus, pour éditer le
  // lien d'un cadeau — même raison de déclaration avant le premier rendu.
  let activeLinkEditor: { anchor: HTMLElement; panel: HTMLElement; cleanup: () => void } | null = null;
  let shellMounted = false;
  let searchQuery = "";
  // null = pas encore évalué (évite de célébrer à l'ouverture d'une liste
  // déjà entièrement emballée) ; sinon, reflète l'état à la dernière vérification.
  let wasFullyChecked: boolean | null = null;
  const conn = new ListConnection(code);

  const UNDO_TIMEOUT_MS = 5000;
  const MAX_UNDO_STACK = 10;
  interface UndoEntry {
    label: string;
    undo: () => void;
    timer: ReturnType<typeof setTimeout>;
  }
  let undoEntries: UndoEntry[] = [];

  function pushUndo(label: string, undo: () => void): void {
    const entry: UndoEntry = {
      label,
      undo,
      timer: setTimeout(() => {
        undoEntries = undoEntries.filter((e) => e !== entry);
        renderUndoToast();
      }, UNDO_TIMEOUT_MS),
    };
    undoEntries.push(entry);
    if (undoEntries.length > MAX_UNDO_STACK) {
      const removed = undoEntries.shift();
      if (removed) clearTimeout(removed.timer);
    }
    renderUndoToast();
  }

  function undoLast(): void {
    const entry = undoEntries.pop();
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.undo();
    renderUndoToast();
  }

  function clearUndoStack(): void {
    for (const entry of undoEntries) clearTimeout(entry.timer);
    undoEntries = [];
    document.getElementById("undo-toast")?.remove();
  }

  function renderUndoToast(): void {
    let el = document.getElementById("undo-toast");
    if (undoEntries.length === 0) {
      el?.remove();
      return;
    }
    const last = undoEntries[undoEntries.length - 1];
    if (!el) {
      el = document.createElement("div");
      el.id = "undo-toast";
      el.className = "undo-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.innerHTML = `<span></span><button type="button">Annuler${undoEntries.length > 1 ? ` (${undoEntries.length})` : ""}</button>`;
    el.querySelector("span")!.textContent = last.label;
    el.querySelector("button")!.addEventListener("click", undoLast);
  }

  function onStateUpdate(next: ListState) {
    state = next;
    loading = false;
    notFound = false;
    cacheListState(next);
    // Pas touchRecentList ici : cette fonction tourne à chaque diffusion
    // serveur, donc à chaque modification faite par n'importe quel appareil
    // connecté (pas seulement une visite de l'utilisateur courant). Le vrai
    // "ouverture de la liste" est déjà couvert par l'appel dans le fetch
    // initial plus bas.
    render();
  }

  conn.onState(onStateUpdate);
  conn.onConnectionChange((isConnected) => {
    connected = isConnected;
    updateConnDot();
  });
  conn.onError((message) => showToast(message));

  (async () => {
    try {
      const fetched = await fetchListState(code);
      if (!fetched) {
        if (!state) {
          notFound = true;
          loading = false;
          render();
          return;
        }
      } else {
        state = fetched;
        cacheListState(fetched);
        touchRecentList(fetched.code, fetched.name);
      }
    } catch {
      loadError = state === null;
    }
    loading = false;
    render();
    conn.connect();
  })();

  render();

  function render(): void {
    if (notFound) {
      root.innerHTML = notFoundHtml(code);
      root.querySelector("#btn-home")?.addEventListener("click", () => navigate("/"));
      return;
    }
    if (loading && !state) {
      root.innerHTML = `<div class="centered-message"><p>Chargement…</p></div>`;
      return;
    }
    if (loadError && !state) {
      root.innerHTML = `<div class="centered-message"><p>Impossible de charger la liste. Vérifie ta connexion.</p><button class="btn" id="retry">Réessayer</button></div>`;
      root.querySelector("#retry")?.addEventListener("click", () => location.reload());
      return;
    }
    if (!state) return;

    if (!shellMounted) {
      // Built only once: re-creating this on every realtime update would
      // wipe out whatever the user is currently typing in the add-item
      // input whenever a broadcast arrives (e.g. someone else adds an item
      // while you're composing yours).
      root.innerHTML = layoutHtml(state, connected);
      wireHeader();
      wireAddForm();
      wireMenu();
      wireRecipientsInteractions(root.querySelector("#recipients") as HTMLElement);
      shellMounted = true;
    } else {
      updateTitle();
      updateRecipientSelect();
    }
    renderRecipients();
    updateTotals();
    updateProgress();
    checkCelebration();
  }

  /** Somme des prix de tous les cadeaux de la liste, tous destinataires
   * confondus — indépendante de la recherche ou de "masquer les cadeaux
   * emballés" en cours, qui ne concernent que l'affichage des cadeaux. Masquée
   * tant qu'aucun prix n'est renseigné, pour ne pas afficher "0,00 €" sur
   * une liste qui n'utilise pas cette fonctionnalité. */
  function updateTotals(): void {
    const el = root.querySelector("#totals-bar") as HTMLElement | null;
    if (!el || !state) return;
    const total = state.items.reduce((sum, i) => sum + (i.price ?? 0), 0);
    el.hidden = total === 0;
    el.textContent = `Total : ${formatPrice(total)}`;
  }

  /** Répartition des cadeaux par statut, sur l'ensemble de la liste — même
   * indépendance vis-à-vis de la recherche/masquage que updateTotals
   * ci-dessus. Masquée tant que la liste est vide (rien à montrer). */
  function updateProgress(): void {
    const el = root.querySelector("#progress-bar") as HTMLElement | null;
    if (!el || !state) return;
    if (state.items.length === 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const counts = new Map<GiftStatus, number>();
    for (const item of state.items) {
      const status = statusOf(item);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    const total = state.items.length;
    const presentStatuses = GIFT_STATUSES.filter((s) => (counts.get(s) ?? 0) > 0);
    el.innerHTML = presentStatuses
      .map((s) => `<span class="progress-segment" style="width: ${((counts.get(s)! / total) * 100).toFixed(2)}%; background: ${GIFT_STATUS_COLORS[s]}"></span>`)
      .join("");
    el.setAttribute("aria-label", presentStatuses.map((s) => `${GIFT_STATUS_LABELS[s]} : ${counts.get(s)}`).join(", "));
  }

  function checkCelebration(): void {
    if (!state) return;
    const isFullyChecked = state.items.length > 0 && state.items.every((i) => i.checked);
    if (wasFullyChecked !== null && isFullyChecked && !wasFullyChecked) celebrate();
    wasFullyChecked = isFullyChecked;
  }

  function celebrate(): void {
    const el = document.createElement("div");
    el.className = "celebration-toast";
    el.setAttribute("role", "status");
    el.textContent = "🎉 Tous les cadeaux sont prêts !";
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("visible"));
    setTimeout(() => {
      el.classList.remove("visible");
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  function updateTitle(): void {
    const titleEl = root.querySelector("#list-title") as HTMLElement | null;
    if (!titleEl || !state) return;
    if (titleEl.querySelector("input")) return; // user is mid-edit, don't clobber
    if (titleEl.textContent !== state.name) titleEl.textContent = state.name;
  }

  function updateRecipientSelect(): void {
    const select = root.querySelector("#add-recipient") as HTMLSelectElement | null;
    if (!select || !state) return;
    const previous = select.value;
    select.innerHTML = recipientOptionsHtml(state.recipients);
    if ([...select.options].some((o) => o.value === previous)) select.value = previous;
  }

  function updateConnDot(): void {
    const dot = root.querySelector("#conn-dot");
    if (!dot) return;
    dot.classList.toggle("online", connected);
    dot.setAttribute("title", connected ? "Synchronisé" : "Connexion…");
  }

  function wireHeader(): void {
    root.querySelector("#btn-home")?.addEventListener("click", () => navigate("/"));
    root.querySelector("#btn-hide-checked")?.addEventListener("click", (e) => {
      toggleHideCheckedPreference();
      updateHideCheckedButton(e.currentTarget as HTMLElement);
      renderRecipients();
    });

    const searchBar = root.querySelector("#search-bar") as HTMLElement | null;
    const searchInput = root.querySelector("#search-input") as HTMLInputElement | null;
    const closeSearch = () => {
      if (searchBar) searchBar.hidden = true;
      searchQuery = "";
      if (searchInput) searchInput.value = "";
      renderRecipients();
    };
    root.querySelector("#btn-search")?.addEventListener("click", () => {
      if (!searchBar) return;
      searchBar.hidden = !searchBar.hidden;
      if (!searchBar.hidden) searchInput?.focus();
      else closeSearch();
    });
    root.querySelector("#search-close")?.addEventListener("click", closeSearch);
    searchInput?.addEventListener("input", () => {
      searchQuery = searchInput.value;
      renderRecipients();
    });
    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSearch();
    });
    const titleEl = root.querySelector("#list-title") as HTMLElement | null;
    titleEl?.addEventListener("click", () => {
      if (!state) return;
      const previousName = state.name;
      startEdit(titleEl, {
        value: previousName,
        onCommit: (value) => {
          // Remplace directement l'input par le texte plutôt que de compter
          // sur le prochain render() : updateTitle() ignore justement toute
          // mise à jour tant qu'un input est présent dans #list-title (pour
          // ne pas écraser une saisie en cours), donc le tick où ce commit
          // s'exécute — où l'input est encore là — ne peut jamais déclencher
          // ce nettoyage lui-même.
          if (!value || value === previousName) {
            titleEl.textContent = previousName;
            return;
          }
          titleEl.textContent = value;
          conn.send({ type: "renameList", name: value });
          pushUndo(`Liste renommée en « ${value} »`, () => conn.send({ type: "renameList", name: previousName }));
        },
      });
    });
  }

  function wireMenu(): void {
    const menuBtn = root.querySelector("#btn-menu");
    const panel = root.querySelector("#menu-panel") as HTMLElement | null;
    menuBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (panel) panel.hidden = !panel.hidden;
    });
    document.addEventListener("click", () => {
      if (panel) panel.hidden = true;
    });

    panel?.querySelector('[data-action="share"]')?.addEventListener("click", () => {
      if (!state) return;
      openShareModal(state.code, state.name, {
        onExport: () => {
          if (state) exportListState(state);
        },
        onImportFile: handleImportFile,
      });
    });
    panel?.querySelector('[data-action="theme"]')?.addEventListener("click", (e) => {
      cycleThemePreference();
      updateThemeMenuItem(e.currentTarget as HTMLElement);
    });
    panel?.querySelector('[data-action="item-sort"]')?.addEventListener("click", (e) => {
      cycleItemSortPreference();
      updateItemSortMenuItem(e.currentTarget as HTMLElement);
      renderRecipients();
    });
    panel?.querySelector('[data-action="manage-recipients"]')?.addEventListener("click", openRecipientManager);
    panel?.querySelector('[data-action="accessibility"]')?.addEventListener("click", openAccessibilityModal);
    const clearCheckedBtn = panel?.querySelector<HTMLButtonElement>('[data-action="clear-checked"]');
    if (clearCheckedBtn) {
      wireConfirmClick(clearCheckedBtn, {
        armedText: "Confirmer : tout vider ?",
        labelEl: clearCheckedBtn.querySelector<HTMLElement>(".menu-item-label") ?? undefined,
        isDisabled: () => (state?.items.filter((i) => i.checked).length ?? 0) === 0,
        onConfirm: () => {
          const checkedItems = state?.items.filter((i) => i.checked) ?? [];
          if (checkedItems.length === 0) return;
          conn.send({ type: "clearChecked" });
          pushUndo(`${checkedItems.length} cadeau(x) emballé(s) vidé(s)`, () => conn.send({ type: "restoreItems", items: checkedItems }));
          if (panel) panel.hidden = true;
        },
      });
    }
  }

  async function handleImportFile(file: File): Promise<void> {
    try {
      const data = await parseImportFile(file);
      openImportModal(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Import impossible.");
    }
  }

  function openImportModal(data: Awaited<ReturnType<typeof parseImportFile>>): void {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" tabindex="-1">
        <button class="icon-btn modal-close" aria-label="Fermer">${icons.close}</button>
        <h2>Importer la liste</h2>
        <p>${data.items.length} cadeau(x) et ${data.recipients.length} personne(s) trouvés dans le fichier.</p>
        <div class="stacked-actions">
          <button class="btn primary" id="import-merge">Fusionner avec la liste actuelle</button>
          <button class="btn danger" id="import-replace">Remplacer la liste actuelle</button>
          <button class="btn" id="import-cancel">Annuler</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const releaseFocusTrap = trapFocus(overlay.querySelector(".modal")!);
    const close = () => {
      overlay.remove();
      releaseFocusTrap();
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onImportKeydown);
    function onImportKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onImportKeydown);
        close();
      }
    }
    overlay.querySelector(".modal-close")?.addEventListener("click", close);
    overlay.querySelector("#import-cancel")?.addEventListener("click", close);
    overlay.querySelector("#import-merge")?.addEventListener("click", () => {
      conn.send({ type: "importState", mode: "merge", data });
      close();
    });
    overlay.querySelector("#import-replace")?.addEventListener("click", () => {
      if (confirm("Remplacer entièrement la liste actuelle par le contenu du fichier ?")) {
        conn.send({ type: "importState", mode: "replace", data });
        close();
      }
    });
  }

  function openRecipientManager(): void {
    if (!state) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    let openPaletteFor: string | null = null;
    let disposeDnd: (() => void) | null = null;
    const render = () => {
      overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" tabindex="-1">
          <button class="icon-btn modal-close" aria-label="Fermer">${icons.close}</button>
          <h2>Personnes</h2>
          <ul class="manage-recipient-list">
            ${[...state!.recipients]
              .sort((a, b) => a.order - b.order)
              .map(
                (r) => `
              <li data-id="${escapeHtml(r.id)}">
                <div class="recipient-row" style="--person-hue: ${escapeHtml(String(resolveRecipientHue(r)))}">
                  <button class="drag-handle recipient-manage-drag-handle" aria-label="Réordonner « ${escapeHtml(r.name)} »">${icons.gripVertical}</button>
                  <button type="button" class="recipient-dot color-swatch-toggle" data-id="${escapeHtml(r.id)}" aria-label="Changer la couleur de « ${escapeHtml(r.name)} »" aria-expanded="${openPaletteFor === r.id}"></button>
                  <span class="recipient-name" data-id="${escapeHtml(r.id)}">${escapeHtml(r.name)}</span>
                  <button class="icon-btn" data-action="del" data-id="${escapeHtml(r.id)}" aria-label="Supprimer">${icons.trash}</button>
                </div>
                ${openPaletteFor === r.id ? colorPaletteHtml(r) : ""}
              </li>`,
              )
              .join("")}
          </ul>
          <form id="new-recipient-form" class="row">
            <input id="new-recipient-name" type="text" placeholder="Prénom" maxlength="40" />
            <button type="submit" class="btn primary">Ajouter</button>
          </form>
          <p class="add-form-hint">${privacyHint()}</p>
        </div>
      `;
      overlay.querySelector(".modal-close")?.addEventListener("click", close);
      overlay.querySelectorAll<HTMLElement>(".recipient-name").forEach((el) => {
        el.addEventListener("click", () => {
          const previousName = el.textContent || "";
          startEdit(el, {
            value: previousName,
            onCommit: (value) => {
              if (!value || value === previousName) return;
              const id = el.dataset.id!;
              conn.send({ type: "renameRecipient", id, name: value });
              pushUndo(`« ${previousName} » renommé en « ${value} »`, () => conn.send({ type: "renameRecipient", id, name: previousName }));
            },
          });
        });
      });
      overlay.querySelectorAll<HTMLElement>(".color-swatch-toggle").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id!;
          openPaletteFor = openPaletteFor === id ? null : id;
          render();
        });
      });
      overlay.querySelectorAll<HTMLElement>(".color-swatch").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.closest("li")?.dataset.id;
          if (!id) return;
          const raw = btn.dataset.color!;
          conn.send({ type: "setRecipientColor", id, color: raw === "auto" ? null : Number(raw) });
          openPaletteFor = null;
          render();
        });
      });
      overlay.querySelectorAll<HTMLElement>('[data-action="del"]').forEach((btn) => {
        const id = btn.dataset.id!;
        const recipient = state!.recipients.find((r) => r.id === id);
        if (!recipient) return;
        wireConfirmClick(btn, {
          armedLabel: `Confirmer la suppression de « ${recipient.name} »`,
          onConfirm: () => {
            const itemIds = state!.items.filter((i) => i.recipientId === id).map((i) => i.id);
            conn.send({ type: "deleteRecipient", id });
            pushUndo(`« ${recipient.name} » supprimé`, () => conn.send({ type: "restoreRecipient", recipient, itemIds }));
          },
        });
      });
      overlay.querySelector("#new-recipient-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = overlay.querySelector("#new-recipient-name") as HTMLInputElement;
        const name = input.value.trim();
        if (!name) return;
        conn.send({ type: "addRecipient", id: uid(), name });
        input.value = "";
      });

      disposeDnd?.();
      disposeDnd = enableDragReorder(overlay, {
        containerSelector: ".manage-recipient-list",
        itemSelector: "li",
        handleSelector: ".recipient-manage-drag-handle",
        onDrop: () => {
          const orderedIds = Array.from(overlay.querySelectorAll<HTMLElement>(".manage-recipient-list li"))
            .map((li) => li.dataset.id!)
            .filter((id) => id);
          conn.send({ type: "reorderRecipients", orderedIds });
        },
      });
    };
    const close = () => {
      disposeDnd?.();
      overlay.remove();
      unsubscribe();
      releaseFocusTrap();
      document.removeEventListener("keydown", onKeydown);
    };
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKeydown);
    const unsubscribe = conn.onState(() => render());
    document.body.appendChild(overlay);
    render();
    const releaseFocusTrap = trapFocus(overlay);
  }

  function wireAddForm(): void {
    const form = root.querySelector("#add-form") as HTMLFormElement | null;
    const input = root.querySelector("#add-input") as HTMLInputElement | null;
    const recipientSelect = root.querySelector("#add-recipient") as HTMLSelectElement | null;
    if (!form || !input) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const rawText = input.value.trim();
      if (!rawText) return;
      const recipientId = recipientSelect?.value || null;
      conn.send({ type: "addItem", id: uid(), rawText, recipientId });
      input.value = "";
      input.focus();
    });
  }

  function closeStatusPicker(): void {
    if (!activeStatusPicker) return;
    activeStatusPicker.anchor.setAttribute("aria-expanded", "false");
    activeStatusPicker.panel.remove();
    activeStatusPicker.cleanup();
    activeStatusPicker = null;
  }

  /** Petit menu flottant listant les 7 statuts, ancré sous le badge cliqué —
   * même principe que les pills de statut d'OnMangeQuoi, adapté en popover
   * plutôt qu'une rangée toujours visible pour rester compact dans une ligne
   * de cadeau. Positionné en `position: fixed` (et non un enfant du `.item`,
   * qui a `overflow: hidden` pour le glisser-supprimer) afin de ne jamais
   * être rogné par la ligne qui l'a ouvert. */
  function openStatusPicker(anchor: HTMLButtonElement, item: Item): void {
    closeStatusPicker();
    const current = statusOf(item);
    const panel = document.createElement("div");
    panel.className = "status-picker";
    panel.setAttribute("role", "menu");
    panel.innerHTML = GIFT_STATUSES.map(
      (s) =>
        `<button type="button" class="status-pill" data-status="${s}" style="--status-color: ${GIFT_STATUS_COLORS[s]}" aria-pressed="${s === current}">${GIFT_STATUS_LABELS[s]}</button>`,
    ).join("");
    document.body.appendChild(panel);

    const rect = anchor.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.left = `${rect.left}px`;
    const overflowX = panel.getBoundingClientRect().right - window.innerWidth + 8;
    if (overflowX > 0) panel.style.left = `${Math.max(8, rect.left - overflowX)}px`;
    anchor.setAttribute("aria-expanded", "true");

    panel.querySelectorAll<HTMLButtonElement>(".status-pill").forEach((pill) => {
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        const status = pill.dataset.status as GiftStatus;
        // Mise à jour optimiste : sans elle, le badge n'apparaît qu'après
        // l'aller-retour serveur. L'état reçu en confirmation écrasera de
        // toute façon cette valeur locale (voir onStateUpdate).
        item.status = status;
        item.checked = status === "emballe";
        if (item.checked) navigator.vibrate?.(10);
        closeStatusPicker();
        renderRecipients();
        conn.send({ type: "updateItem", id: item.id, status });
      });
    });

    function onDocClick(e: MouseEvent): void {
      if (!panel.contains(e.target as Node)) closeStatusPicker();
    }
    function onKeydown(e: KeyboardEvent): void {
      if (e.key === "Escape") closeStatusPicker();
    }
    // Différé d'un tick : sinon le clic qui vient d'ouvrir ce popover (déjà
    // en cours de propagation) serait aussi capté par ce même listener et le
    // refermerait aussitôt.
    setTimeout(() => {
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onKeydown);
    });
    activeStatusPicker = {
      anchor,
      panel,
      cleanup: () => {
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKeydown);
      },
    };
  }

  function closeLinkEditor(): void {
    if (!activeLinkEditor) return;
    activeLinkEditor.anchor.setAttribute("aria-expanded", "false");
    activeLinkEditor.panel.remove();
    activeLinkEditor.cleanup();
    activeLinkEditor = null;
  }

  /** Petit popover flottant pour ajouter/modifier/retirer le lien d'un
   * cadeau — même principe de positionnement que openStatusPicker. Le lien
   * affiché est toujours celui reçu du serveur (déjà normalisé par
   * worker/reducer.ts), jamais une valeur locale non confirmée. */
  function openLinkEditor(anchor: HTMLButtonElement, item: Item): void {
    closeLinkEditor();
    const panel = document.createElement("div");
    panel.className = "link-editor";
    panel.setAttribute("role", "dialog");
    document.body.appendChild(panel);
    anchor.setAttribute("aria-expanded", "true");

    function position(): void {
      const rect = anchor.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 4}px`;
      panel.style.left = `${rect.left}px`;
      const overflowX = panel.getBoundingClientRect().right - window.innerWidth + 8;
      if (overflowX > 0) panel.style.left = `${Math.max(8, rect.left - overflowX)}px`;
    }

    // Un lien déjà présent s'affiche d'abord en lecture seule (avec un
    // raccourci pour l'ouvrir) plutôt que directement dans un champ éditable
    // — l'édition ne s'ouvre qu'au clic sur l'icône crayon, pour ne pas
    // donner l'impression qu'un clic dans le texte va le modifier.
    function renderView(): void {
      panel.innerHTML = `
        <div class="link-editor-view">
          <a class="link-editor-open" href="${escapeHtml(item.link!)}" target="_blank" rel="noopener noreferrer">${icons.link}<span>${escapeHtml(item.link!)}</span></a>
          <button type="button" class="icon-btn link-editor-edit" aria-label="Modifier le lien">${icons.edit}</button>
        </div>
      `;
      position();
      panel.querySelector(".link-editor-edit")!.addEventListener("click", (e) => {
        // stopPropagation avant de remplacer le innerHTML du panel : sinon
        // ce même clic (dont la cible vient d'être détachée du DOM) atteint
        // le listener document → onDocClick le prend pour un clic extérieur
        // et referme aussitôt le popover qu'on vient d'ouvrir en mode édition.
        e.stopPropagation();
        renderForm();
      });
    }

    function renderForm(): void {
      panel.innerHTML = `
        <form class="link-editor-form" novalidate>
          <input type="text" inputmode="url" class="link-editor-input" placeholder="https://..." value="${escapeHtml(item.link ?? "")}" />
          <button type="submit" class="btn primary">Enregistrer</button>
        </form>
        ${item.link ? `<button type="button" class="link-editor-remove">Supprimer le lien</button>` : ""}
      `;
      position();
      const input = panel.querySelector<HTMLInputElement>(".link-editor-input")!;
      input.focus();
      panel.querySelector(".link-editor-form")!.addEventListener("submit", (e) => {
        e.preventDefault();
        const link = input.value.trim();
        conn.send({ type: "updateItem", id: item.id, link });
        closeLinkEditor();
      });
      panel.querySelector(".link-editor-remove")?.addEventListener("click", () => {
        conn.send({ type: "updateItem", id: item.id, link: "" });
        closeLinkEditor();
      });
    }

    if (item.link) renderView();
    else renderForm();

    function onDocClick(e: MouseEvent): void {
      if (!panel.contains(e.target as Node)) closeLinkEditor();
    }
    function onKeydown(e: KeyboardEvent): void {
      if (e.key === "Escape") closeLinkEditor();
    }
    setTimeout(() => {
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onKeydown);
    });
    activeLinkEditor = {
      anchor,
      panel,
      cleanup: () => {
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKeydown);
      },
    };
  }

  function renderRecipients(): void {
    const container = root.querySelector("#recipients") as HTMLElement | null;
    if (!container || !state) return;
    // Le popover référence un bouton précis du DOM actuel : sur le point de
    // reconstruire ce DOM, mieux vaut le refermer plutôt que de le laisser
    // pointer vers un nœud qui va disparaître.
    closeStatusPicker();
    closeLinkEditor();

    const query = searchQuery.trim().toLowerCase();
    const itemSort = getItemSortPreference();
    const hideChecked = getHideCheckedPreference();

    // Un seul passage sur tous les cadeaux plutôt qu'un filter/reduce complet
    // par personne (ce qui serait O(nombre de cadeaux × nombre de personnes)) :
    // on regroupe une bonne fois par recipientId, byRecipient/recipientTotal/
    // hasAnyGift ne font plus que lire ces regroupements.
    const itemsByRecipient = new Map<string | null, Item[]>();
    const totalByRecipient = new Map<string | null, number>();
    for (const item of state.items) {
      const key = item.recipientId;
      const items = itemsByRecipient.get(key);
      if (items) items.push(item);
      else itemsByRecipient.set(key, [item]);
      totalByRecipient.set(key, (totalByRecipient.get(key) ?? 0) + (item.price ?? 0));
    }
    const byRecipient = (recipientId: string | null): Item[] => {
      const items = itemsByRecipient.get(recipientId) ?? [];
      if (!query && !hideChecked) return items;
      return items.filter((i) => (!query || i.name.toLowerCase().includes(query)) && (!hideChecked || !i.checked));
    };
    const hasAnyGift = (recipientId: string | null): boolean => (itemsByRecipient.get(recipientId)?.length ?? 0) > 0;
    // Toujours calculé sur l'ensemble des cadeaux de la personne, indépendamment
    // de la recherche ou de "masquer les cadeaux emballés" en cours : le budget
    // d'une personne ne doit pas varier selon l'affichage du moment.
    const recipientTotal = (recipientId: string | null): number => totalByRecipient.get(recipientId) ?? 0;
    // Un cadeau sans prix se retrouve après ceux qui en ont un, en tri par
    // prix — plutôt que mélangé arbitrairement selon l'ordre d'insertion.
    const secondarySort = (a: Item, b: Item): number => {
      if (itemSort === "alphabetical") return alnumCompare(a.name, b.name);
      if (itemSort === "price") return (a.price ?? Infinity) - (b.price ?? Infinity) || alnumCompare(a.name, b.name);
      return a.order - b.order;
    };
    const sortItems = (items: Item[]): Item[] => [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || secondarySort(a, b));

    const recipients = [...state.recipients].sort((a, b) => a.order - b.order);
    type Group = { id: string | null; name: string; items: Item[]; showHeader: boolean; hue: number };
    let groups: Group[] = recipients.map((r) => ({
      id: r.id,
      name: r.name,
      items: sortItems(byRecipient(r.id)),
      showHeader: true,
      hue: resolveRecipientHue(r),
    }));
    const unassigned = sortItems(byRecipient(null));
    if (recipients.length === 0) {
      groups.unshift({ id: null, name: "Cadeaux", items: unassigned, showHeader: false, hue: 0 });
    } else if (unassigned.length > 0) {
      groups.push({ id: null, name: "Sans destinataire", items: unassigned, showHeader: true, hue: 0 });
    }

    // Une personne reste affichée même sans aucun cadeau (pour ne pas
    // l'oublier, et pour pouvoir lui glisser-déposer un premier cadeau) —
    // sauf pendant une recherche ou avec "masquer les cadeaux emballés", où
    // une section vide n'a rien d'utile à montrer. Le pseudo-groupe "Sans
    // destinataire"/"Cadeaux" (id null), lui, ne s'affiche que s'il a
    // effectivement quelque chose dedans.
    groups = groups.filter((g) => g.items.length > 0 || (g.id !== null && !query && !hasAnyGift(g.id)));

    // Une personne dont tous les cadeaux sont emballés passe après celles
    // encore en cours, même logique que pour les cadeaux au sein d'une
    // personne (voir sortItems ci-dessus). Tri stable : ne touche pas à
    // l'ordre relatif au sein de chaque groupe (complet / non complet).
    groups.sort((a, b) => Number(a.items.every((i) => i.checked)) - Number(b.items.every((i) => i.checked)));

    if (groups.length === 0 && query) {
      container.innerHTML = `<div class="empty-state">Aucun cadeau ne correspond à « ${escapeHtml(searchQuery.trim())} ».</div>`;
      return;
    }

    if (groups.length === 0 && hideChecked && state.items.length > 0) {
      container.innerHTML = `<div class="empty-state">Tous les cadeaux sont emballés (et masqués).</div>`;
      return;
    }

    if (groups.length === 0) {
      container.innerHTML = `<div class="empty-state">Ta liste est vide. Ajoute un premier cadeau ci-dessus 👆</div>`;
      return;
    }

    container.innerHTML = groups
      .map(
        (g) => `
      <section class="recipient-section${g.id ? " has-color" : ""}" data-recipient-id="${escapeHtml(g.id ?? "")}" ${g.id ? `style="--person-hue: ${escapeHtml(String(g.hue))}"` : ""}>
        ${
          g.showHeader
            ? `<header class="recipient-header">
                ${g.id ? `<button class="drag-handle recipient-drag-handle" aria-label="Réordonner la personne">${icons.gripVertical}</button>` : `<span class="drag-handle-spacer"></span>`}
                ${g.id ? `<span class="person-dot" aria-hidden="true"></span>` : ""}
                <span class="person-name" data-id="${escapeHtml(g.id ?? "")}">${escapeHtml(g.name)}</span>
                ${recipientTotal(g.id) > 0 ? `<span class="recipient-total">${formatPrice(recipientTotal(g.id))}</span>` : ""}
                <span class="recipient-count">${g.items.filter((i) => !i.checked).length}</span>
                <button type="button" class="icon-btn recipient-add" data-id="${escapeHtml(g.id ?? "")}" aria-label="Ajouter un cadeau pour ${escapeHtml(g.name)}">${icons.plus}</button>
              </header>`
            : ""
        }
        <ul class="item-list" data-recipient-id="${escapeHtml(g.id ?? "")}">
          ${g.items.map((item) => itemRowHtml(item, code)).join("")}
        </ul>
        ${g.id && g.items.length === 0 ? `<p class="recipient-empty">Aucun cadeau pour l'instant</p>` : ""}
      </section>`,
      )
      .join("");

    // Raccourci pour ajouter directement un cadeau à cette personne : plutôt
    // que de rouvrir le sélecteur du formulaire d'ajout, on le présélectionne
    // et on ramène le focus dessus (voir wireAddForm) — le formulaire, lui,
    // reste unique et en haut de page plutôt que dupliqué par section.
    container.querySelectorAll<HTMLButtonElement>(".recipient-add").forEach((btn) => {
      btn.addEventListener("click", () => {
        const recipientSelect = root.querySelector("#add-recipient") as HTMLSelectElement | null;
        const input = root.querySelector("#add-input") as HTMLInputElement | null;
        if (recipientSelect) recipientSelect.value = btn.dataset.id ?? "";
        input?.scrollIntoView({ behavior: "smooth", block: "center" });
        input?.focus();
      });
    });

    container.querySelectorAll<HTMLButtonElement>(".item-status").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const item = state!.items.find((i) => i.id === btn.dataset.id);
        if (!item) return;
        if (activeStatusPicker?.anchor === btn) {
          closeStatusPicker();
          return;
        }
        openStatusPicker(btn, item);
      });
    });

    container.querySelectorAll<HTMLButtonElement>(".item-link").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const item = state!.items.find((i) => i.id === btn.dataset.id);
        if (!item) return;
        if (activeLinkEditor?.anchor === btn) {
          closeLinkEditor();
          return;
        }
        openLinkEditor(btn, item);
      });
    });

    container.querySelectorAll<HTMLElement>('[data-action="delete-item"]').forEach((btn) => {
      const item = state!.items.find((i) => i.id === btn.dataset.id);
      if (!item) return;
      wireConfirmClick(btn, {
        armedLabel: `Confirmer la suppression de « ${item.name} »`,
        onConfirm: () => {
          conn.send({ type: "deleteItem", id: item.id });
          pushUndo(`« ${item.name} » supprimé`, () => conn.send({ type: "restoreItems", items: [item] }));
        },
      });
    });

    container.querySelectorAll<HTMLElement>(".item-name").forEach((el) => {
      el.addEventListener("click", () => {
        const item = state!.items.find((i) => i.id === el.dataset.id);
        if (!item) return;
        const previousName = item.name;
        startEdit(el, {
          value: previousName,
          onCommit: (value) => {
            if (!value) {
              render();
              return;
            }
            if (value === previousName) return;
            conn.send({ type: "updateItem", id: item.id, name: value });
            pushUndo(`« ${previousName} » renommé en « ${value} »`, () => conn.send({ type: "updateItem", id: item.id, name: previousName }));
          },
        });
      });
    });

    container.querySelectorAll<HTMLElement>(".item-price").forEach((el) => {
      el.addEventListener("click", () => {
        const item = state!.items.find((i) => i.id === el.dataset.id);
        if (!item) return;
        const previousPrice = item.price ?? null;
        startEdit(el, {
          value: item.price !== undefined ? formatPrice(item.price).replace(" €", "") : "",
          placeholder: "Prix en €",
          onCommit: (value) => {
            const price = parsePriceInput(value);
            if (price === undefined) {
              showToast("Prix invalide.");
              renderRecipients();
              return;
            }
            if (price === previousPrice) return;
            conn.send({ type: "updateItem", id: item.id, price });
            pushUndo(`Prix de « ${item.name} » modifié`, () => conn.send({ type: "updateItem", id: item.id, price: previousPrice }));
          },
        });
      });
    });

    container.querySelectorAll<HTMLElement>(".person-name").forEach((el) => {
      if (!el.dataset.id) return;
      el.addEventListener("click", () => {
        const previousName = el.textContent || "";
        startEdit(el, {
          value: previousName,
          onCommit: (value) => {
            if (!value || value === previousName) return;
            const id = el.dataset.id!;
            conn.send({ type: "renameRecipient", id, name: value });
            pushUndo(`« ${previousName} » renommé en « ${value} »`, () => conn.send({ type: "renameRecipient", id, name: previousName }));
          },
        });
      });
    });

    wireItemImages(container);
  }

  /** Glisser-déposer (cadeaux + personnes) et glisser-supprimer, câblés une
   * seule fois sur le conteneur #recipients (stable d'un rendu à l'autre,
   * seul son innerHTML est remplacé) plutôt que détruits/recréés à chaque
   * appel de renderRecipients : les callbacks ci-dessous ne lisent que
   * `state`/le DOM au moment du drop, donc rester attachés au conteneur
   * entre deux rendus ne change rien à leur comportement — juste beaucoup
   * moins de (dés)abonnements sur une liste très active. */
  function wireRecipientsInteractions(container: HTMLElement): void {
    // Le glisser-déposer reste actif même en tri automatique (alphabétique
    // ou prix) : il permet toujours de déplacer un cadeau vers une autre
    // personne. Seul le repositionnement au sein d'une même personne n'a
    // plus d'effet visuel durable (le prochain rendu retrie automatiquement).
    disposeItemDnd = enableDragReorder(container, {
      containerSelector: ".item-list",
      itemSelector: ".item",
      handleSelector: ".item-drag-handle",
      onDrop: (el) => {
        const itemId = el.dataset.id!;
        const newRecipientRaw = el.closest(".item-list")?.getAttribute("data-recipient-id") ?? "";
        const newRecipientId = newRecipientRaw || null;
        const item = state!.items.find((i) => i.id === itemId);
        if (item && item.recipientId !== newRecipientId) {
          conn.send({ type: "updateItem", id: itemId, recipientId: newRecipientId });
        }
        const orderedIds = Array.from(container.querySelectorAll<HTMLElement>(".item")).map((li) => li.dataset.id!);
        conn.send({ type: "reorderItems", orderedIds });
      },
    });

    disposeRecipientDnd = enableDragReorder(container, {
      containerSelector: "#recipients",
      itemSelector: ".recipient-section",
      handleSelector: ".recipient-drag-handle",
      onDrop: () => {
        const orderedIds = Array.from(container.querySelectorAll<HTMLElement>(".recipient-section"))
          .map((el) => el.dataset.recipientId!)
          .filter((id) => id);
        conn.send({ type: "reorderRecipients", orderedIds });
      },
    });

    disposeSwipe = enableSwipeToDelete(container, {
      itemSelector: ".item",
      contentSelector: ".item-content",
      ignoreSelector: ".item-drag-handle, .item-status, .item-delete, .item-photo, .item-link",
      onDelete: (el) => {
        const item = state!.items.find((i) => i.id === el.dataset.id);
        if (!item) return;
        conn.send({ type: "deleteItem", id: item.id });
        pushUndo(`« ${item.name} » supprimé`, () => conn.send({ type: "restoreItems", items: [item] }));
      },
    });
  }

  /** Ajout/remplacement (via le sélecteur de fichier) et suppression (via la
   * visionneuse plein écran) d'une photo par cadeau. Pas de mise à jour
   * optimiste : comme pour le reste de l'app, la miniature ne se met à jour
   * qu'au retour de l'état par le serveur (ici via la diffusion websocket
   * déclenchée par l'upload, voir worker/index.ts), l'appel HTTP se
   * contentant de confirmer/rejeter l'envoi lui-même. */
  function wireItemImages(container: Element): void {
    function setLoading(id: string, isLoading: boolean): void {
      container.querySelector(`.item-photo[data-id="${id}"]`)?.classList.toggle("is-loading", isLoading);
    }

    async function send(id: string, file: File): Promise<void> {
      if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
        showToast("Format d'image non supporté (PNG, JPEG, WebP ou GIF).");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        showToast("Image trop volumineuse (5 Mo max).");
        return;
      }
      setLoading(id, true);
      try {
        await uploadItemImage(code, id, file);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Erreur réseau, réessaie.");
      } finally {
        setLoading(id, false);
      }
    }

    function remove(id: string): void {
      setLoading(id, true);
      deleteItemImage(code, id)
        .catch((err) => showToast(err instanceof Error ? err.message : "Erreur réseau, réessaie."))
        .finally(() => setLoading(id, false));
    }

    container.querySelectorAll<HTMLButtonElement>('[data-action="item-photo"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = state!.items.find((i) => i.id === btn.dataset.id);
        if (!item) return;
        if (item.hasImage) {
          openImageLightbox(itemImageUrl(code, item.id, item.imageVersion), item.name, () => remove(item.id));
        } else {
          container.querySelector<HTMLInputElement>(`.item-image-input[data-id="${item.id}"]`)?.click();
        }
      });
    });
    container.querySelectorAll<HTMLInputElement>(".item-image-input").forEach((input) => {
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        const id = input.dataset.id!;
        input.value = "";
        if (file) send(id, file);
      });
    });
  }

  function itemRowHtml(item: Item, code: string): string {
    // La poignée reste utile même en tri automatique : elle permet de
    // déplacer un cadeau vers une autre personne (le seul autre moyen étant
    // de le supprimer puis de le rajouter). Seul le repositionnement au sein
    // d'une même personne devient sans effet visuel dans ce mode (l'ordre
    // est alors recalculé à chaque rendu).
    const status = statusOf(item);
    // item.id/item.link ne viennent pas toujours d'un champ de formulaire
    // (voir importState dans worker/reducer.ts, seul cas où ces valeurs
    // arrivent d'un fichier externe) : on les échappe donc ici plutôt que de
    // compter uniquement sur leur normalisation côté serveur.
    const safeId = escapeHtml(item.id);
    const photoContent = item.hasImage
      ? `<img src="${escapeHtml(itemImageUrl(code, item.id, item.imageVersion))}" alt="" loading="lazy" />`
      : icons.image;
    return `
      <li class="item ${item.checked ? "checked" : ""}" data-id="${safeId}" style="--status-color: ${GIFT_STATUS_COLORS[status]}">
        <div class="item-swipe-bg" aria-hidden="true">${icons.trash}</div>
        <div class="item-content">
          <button class="drag-handle item-drag-handle" aria-label="Déplacer">${icons.gripVertical}</button>
          <button type="button" class="item-status" data-id="${safeId}" aria-haspopup="true" aria-expanded="false" aria-label="Statut : ${GIFT_STATUS_LABELS[status]} (cliquer pour changer)">${GIFT_STATUS_LABELS[status]}</button>
          <span class="item-price ${item.price !== undefined ? "" : "item-price-empty"}" data-id="${safeId}" title="${item.price !== undefined ? "Modifier le prix" : "Ajouter un prix"}">${item.price !== undefined ? formatPrice(item.price) : "€"}</span>
          <span class="item-name" data-id="${safeId}">${escapeHtml(item.name)}</span>
          <button type="button" class="item-photo${item.hasImage ? "" : " item-photo-empty"}" data-action="item-photo" data-id="${safeId}" aria-label="${item.hasImage ? `Voir la photo de « ${escapeHtml(item.name)} »` : `Ajouter une photo à « ${escapeHtml(item.name)} »`}">${photoContent}</button>
          <input type="file" class="item-image-input" data-id="${safeId}" accept="${ALLOWED_IMAGE_TYPES.join(",")}" hidden />
          <button type="button" class="item-link${item.link ? " item-link-set" : " item-link-empty"}" data-id="${safeId}" aria-haspopup="true" aria-expanded="false" aria-label="${item.link ? `Voir/modifier le lien de « ${escapeHtml(item.name)} »` : `Ajouter un lien à « ${escapeHtml(item.name)} »`}">${icons.link}</button>
          <button class="icon-btn item-delete" data-action="delete-item" data-id="${safeId}" aria-label="Supprimer">${icons.trash}</button>
        </div>
      </li>
    `;
  }

  function recipientOptionsHtml(recipients: Recipient[], selectedId: string | null = null): string {
    // Alphabétique plutôt que l'ordre manuel des personnes (voir
    // renderRecipients) : plus facile à parcourir dans une liste déroulante
    // qu'à retenir un ordre personnalisé.
    const sorted = [...recipients].sort((a, b) => alnumCompare(a.name, b.name));
    const optionHtml = (r: Recipient) => `<option value="${escapeHtml(r.id)}" ${r.id === selectedId ? "selected" : ""}>${escapeHtml(r.name)}</option>`;
    return [`<option value="" ${selectedId === null ? "selected" : ""}>Sans destinataire</option>`, sorted.map(optionHtml).join("")].join("");
  }

  function layoutHtml(s: ListState, isConnected: boolean): string {
    return `
      <div class="list-view">
        <header class="list-header">
          <button class="icon-btn" id="btn-home" aria-label="Accueil">${icons.back}</button>
          <h1 class="list-title" id="list-title">${escapeHtml(s.name)}</h1>
          <span class="lock-badge" title="Données chiffrées sur le serveur" aria-label="Données chiffrées sur le serveur">${icons.lock}</span>
          <span class="conn-dot ${isConnected ? "online" : ""}" id="conn-dot" title="${isConnected ? "Synchronisé" : "Connexion…"}"></span>
          <button class="icon-btn" id="btn-search" aria-label="Rechercher">${icons.search}</button>
          ${hideCheckedButtonHtml(getHideCheckedPreference())}
          <button class="icon-btn" id="btn-menu" aria-label="Menu">${icons.more}</button>
          <div class="menu-panel" id="menu-panel" hidden>
            <button type="button" data-action="share"><span class="menu-item-icon">${icons.share}</span>Partager</button>
            <button type="button" data-action="theme">${themeMenuHtml(getThemePreference())}</button>
            <button type="button" data-action="item-sort">${itemSortMenuHtml(getItemSortPreference())}</button>
            <button type="button" data-action="manage-recipients"><span class="menu-item-icon">${icons.user}</span>Gérer les personnes</button>
            <button type="button" data-action="accessibility"><span class="menu-item-icon">${icons.accessibility}</span>Accessibilité</button>
            <button type="button" data-action="clear-checked"><span class="menu-item-icon">${icons.checkCircle}</span><span class="menu-item-label">Vider les cadeaux emballés</span></button>
          </div>
        </header>

        <div class="search-bar" id="search-bar" hidden>
          <input id="search-input" type="text" aria-label="Rechercher un cadeau" placeholder="Rechercher un cadeau…" />
          <button class="icon-btn" id="search-close" aria-label="Fermer la recherche">${icons.close}</button>
        </div>

        <form id="add-form" class="add-form">
          <div class="add-row">
            <input id="add-input" class="add-input" type="text" placeholder="Ajouter un cadeau…" autocomplete="off" />
            <select id="add-recipient" aria-label="Personne">
              ${recipientOptionsHtml(s.recipients)}
            </select>
            <button type="submit" class="btn primary add-submit" aria-label="Ajouter">${icons.plus}</button>
          </div>
        </form>
        <p class="add-form-hint">${privacyHint()}</p>

        <div class="progress-bar" id="progress-bar" role="img" hidden></div>
        <p class="totals-bar" id="totals-bar" hidden></p>

        <div id="recipients" class="recipients"></div>

        <p class="list-privacy-note">${privacyHint()}</p>
      </div>
    `;
  }

  function themeMenuHtml(pref: ThemePreference): string {
    return `<span class="menu-item-icon">${THEME_ICON[pref]}</span> Thème : ${themeLabel(pref)}`;
  }

  function updateThemeMenuItem(button: HTMLElement): void {
    button.innerHTML = themeMenuHtml(getThemePreference());
  }

  function itemSortMenuHtml(pref: ReturnType<typeof getItemSortPreference>): string {
    return `<span class="menu-item-icon">${icons.sort}</span>Tri des cadeaux : ${itemSortLabel(pref)}`;
  }

  function updateItemSortMenuItem(button: HTMLElement): void {
    button.innerHTML = itemSortMenuHtml(getItemSortPreference());
  }

  function hideCheckedButtonHtml(hide: boolean): string {
    return `<button class="icon-btn" id="btn-hide-checked" aria-label="${hide ? "Afficher les cadeaux emballés" : "Masquer les cadeaux emballés"}" aria-pressed="${hide}">${hide ? icons.eyeOff : icons.eye}</button>`;
  }

  function updateHideCheckedButton(button: HTMLElement): void {
    const hide = getHideCheckedPreference();
    button.setAttribute("aria-label", hide ? "Afficher les cadeaux emballés" : "Masquer les cadeaux emballés");
    button.setAttribute("aria-pressed", String(hide));
    button.innerHTML = hide ? icons.eyeOff : icons.eye;
  }

  function notFoundHtml(c: string): string {
    return `
      <div class="centered-message">
        <p>Aucune liste ne correspond au code <strong>${escapeHtml(c)}</strong>.</p>
        <button class="btn primary" id="btn-home">Retour à l'accueil</button>
      </div>
    `;
  }

  function showToast(message: string): void {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("visible"));
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  return () => {
    conn.disconnect();
    disposeItemDnd?.();
    disposeRecipientDnd?.();
    disposeSwipe?.();
    clearUndoStack();
    closeStatusPicker();
    closeLinkEditor();
    document.querySelectorAll(".modal-overlay").forEach((el) => el.remove());
  };
}
