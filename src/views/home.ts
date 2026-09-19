import { createList, fetchListState } from "../lib/http";
import { getRecentLists, forgetRecentList, touchRecentList, toggleFavoriteList, type RecentList } from "../lib/storage";
import { escapeHtml } from "../lib/dom";
import { icons } from "../lib/icons";
import { cycleThemePreference, getThemePreference, themeLabel, type ThemePreference } from "../lib/theme";
import { privacyHint } from "../lib/privacyHint";
import { openAccessibilityModal } from "../components/accessibilityModal";
import { peekPendingImport, clearPendingImport } from "../lib/pendingImport";
import { trapFocus } from "../lib/focusTrap";

const THEME_ICON: Record<ThemePreference, string> = { system: icons.themeAuto, light: icons.sun, dark: icons.moon };

export function mountHomeView(root: HTMLElement, navigate: (path: string) => void): () => void {
  render();
  maybeShowPendingImportPrompt();

  function maybeShowPendingImportPrompt(): void {
    const payload = peekPendingImport();
    if (!payload) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" tabindex="-1">
        <button class="icon-btn modal-close" aria-label="Fermer">${icons.close}</button>
        <h2>Lien de partage compact</h2>
        <p>Ce lien contient ${payload.items.length} cadeau(x) et ${payload.recipients.length} personne(s). Créer une nouvelle liste à partir de ce contenu ?</p>
        <div class="stacked-actions">
          <button class="btn primary" id="pending-import-create">Créer la liste</button>
          <button class="btn" id="pending-import-cancel">Ignorer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const releaseFocusTrap = trapFocus(overlay.querySelector(".modal")!);
    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKeydown);
      releaseFocusTrap();
    };
    const dismiss = () => {
      clearPendingImport();
      close();
    };
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", onKeydown);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) dismiss();
    });
    overlay.querySelector(".modal-close")?.addEventListener("click", dismiss);
    overlay.querySelector("#pending-import-cancel")?.addEventListener("click", dismiss);
    overlay.querySelector("#pending-import-create")?.addEventListener("click", async () => {
      const btn = overlay.querySelector("#pending-import-create") as HTMLButtonElement;
      btn.disabled = true;
      try {
        const state = await createList(payload.name || "Liste de cadeaux");
        touchRecentList(state.code, state.name);
        close();
        navigate(`/l/${state.code}`);
      } catch {
        alert("Impossible de créer la liste. Vérifie ta connexion internet.");
        btn.disabled = false;
      }
    });
  }

  function recentItemHtml(r: RecentList): string {
    return `
      <li class="recent-item">
        <button type="button" class="icon-btn recent-favorite" data-code="${r.code}" aria-label="${r.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}" aria-pressed="${r.favorite ? "true" : "false"}">
          ${r.favorite ? icons.starFilled : icons.star}
        </button>
        <button type="button" class="recent-open" data-code="${r.code}">
          <span class="recent-name">${escapeHtml(r.name)}</span>
        </button>
        <button type="button" class="icon-btn recent-forget" data-code="${r.code}" aria-label="Oublier cette liste">${icons.close}</button>
      </li>`;
  }

  function render(): void {
    const recents = getRecentLists();
    const favorites = recents.filter((r) => r.favorite);
    const others = recents.filter((r) => !r.favorite);
    const theme = getThemePreference();
    root.innerHTML = `
      <div class="home">
        <div class="home-toolbar">
          <button type="button" class="icon-btn" id="btn-accessibility" aria-label="Accessibilité" title="Accessibilité">
            ${icons.accessibility}
          </button>
          <button type="button" class="icon-btn" id="theme-toggle" aria-label="Thème : ${themeLabel(theme)}" title="Thème : ${themeLabel(theme)}">
            ${THEME_ICON[theme]}
          </button>
        </div>
        <header class="home-header">
          <div class="logo">${icons.gift}</div>
          <h1>DansMaHotte</h1>
          <p class="tagline">Une liste de cadeaux de Noël partagée, synchronisée en direct.</p>
          <p class="tagline privacy-note">${privacyHint()}</p>
        </header>

        ${
          recents.length
            ? `<section class="card">
                <h2>Listes récentes</h2>
                ${
                  favorites.length
                    ? `<h3 class="recent-subheading">Favoris</h3>
                       <ul class="recent-list">${favorites.map(recentItemHtml).join("")}</ul>`
                    : ""
                }
                ${
                  others.length
                    ? `${favorites.length ? '<h3 class="recent-subheading">Autres</h3>' : ""}
                       <ul class="recent-list">${others.map(recentItemHtml).join("")}</ul>`
                    : ""
                }
              </section>`
            : ""
        }

        <section class="card">
          <h2>Nouvelle liste</h2>
          <form id="create-form" class="row">
            <input id="create-name" type="text" placeholder="Nom de la liste (optionnel)" maxlength="60" />
            <button type="submit" class="btn primary">Créer</button>
          </form>
          <p class="add-form-hint">${privacyHint()}</p>
        </section>

        <section class="card">
          <h2>Rejoindre une liste</h2>
          <form id="join-form" class="row">
            <input id="join-code" type="text" placeholder="Code à 6 caractères" maxlength="10" autocapitalize="characters" />
            <button type="submit" class="btn">Rejoindre</button>
          </form>
          <p id="join-error" class="error" hidden></p>
        </section>
      </div>
    `;

    root.querySelector("#theme-toggle")?.addEventListener("click", () => {
      cycleThemePreference();
      render();
    });

    root.querySelector("#btn-accessibility")?.addEventListener("click", openAccessibilityModal);

    root.querySelector("#create-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const nameInput = root.querySelector("#create-name") as HTMLInputElement;
      const btn = form.querySelector("button") as HTMLButtonElement;
      btn.disabled = true;
      try {
        const state = await createList(nameInput.value.trim() || "Liste de cadeaux");
        touchRecentList(state.code, state.name);
        navigate(`/l/${state.code}`);
      } catch {
        alert("Impossible de créer la liste. Vérifie ta connexion internet.");
        btn.disabled = false;
      }
    });

    root.querySelector("#join-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const input = root.querySelector("#join-code") as HTMLInputElement;
      const errorEl = root.querySelector("#join-error") as HTMLElement;
      const btn = form.querySelector("button") as HTMLButtonElement;
      const code = input.value.trim().toUpperCase();
      errorEl.hidden = true;
      if (!code) return;
      btn.disabled = true;
      try {
        const state = await fetchListState(code);
        if (!state) {
          errorEl.textContent = "Aucune liste ne correspond à ce code.";
          errorEl.hidden = false;
        } else {
          touchRecentList(state.code, state.name);
          navigate(`/l/${state.code}`);
        }
      } catch {
        errorEl.textContent = "Erreur réseau, réessaie.";
        errorEl.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });

    root.querySelectorAll<HTMLButtonElement>(".recent-open").forEach((btn) => {
      btn.addEventListener("click", () => navigate(`/l/${btn.dataset.code}`));
    });
    root.querySelectorAll<HTMLButtonElement>(".recent-favorite").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.dataset.code) toggleFavoriteList(btn.dataset.code);
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>(".recent-forget").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.dataset.code) forgetRecentList(btn.dataset.code);
        render();
      });
    });
  }

  return () => {};
}
