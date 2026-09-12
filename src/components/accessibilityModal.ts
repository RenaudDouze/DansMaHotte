import { icons } from "../lib/icons";
import { trapFocus } from "../lib/focusTrap";
import { getAccessibilityPreference, setAccessibilityPreference, type AccessibilityPreference } from "../lib/accessibilityPreference";

const OPTIONS: { key: keyof AccessibilityPreference; label: string; hint: string }[] = [
  { key: "largeText", label: "Texte plus grand", hint: "Augmente la taille du texte dans toute l'application." },
  { key: "highContrast", label: "Contraste élevé", hint: "Renforce le contraste entre le texte et le fond." },
  { key: "reduceMotion", label: "Réduire les animations", hint: "Désactive les transitions et animations." },
];

/** Petit réglage d'accessibilité, réutilisable depuis l'accueil et depuis une
 * liste (même préférence, par appareil — voir accessibilityPreference.ts) :
 * chaque case s'applique immédiatement, sans bouton de validation séparé. */
export function openAccessibilityModal(): void {
  const pref = getAccessibilityPreference();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal accessibility-modal" role="dialog" aria-modal="true" tabindex="-1">
      <button class="icon-btn modal-close" aria-label="Fermer">${icons.close}</button>
      <h2>Accessibilité</h2>
      <ul class="accessibility-options">
        ${OPTIONS.map(
          (opt) => `
          <li>
            <label class="accessibility-option">
              <input type="checkbox" data-key="${opt.key}" ${pref[opt.key] ? "checked" : ""} />
              <span>
                <strong>${opt.label}</strong>
                <small>${opt.hint}</small>
              </span>
            </label>
          </li>`,
        ).join("")}
      </ul>
    </div>
  `;
  document.body.appendChild(overlay);

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

  overlay.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.key as keyof AccessibilityPreference;
      setAccessibilityPreference({ ...getAccessibilityPreference(), [key]: input.checked });
    });
  });
}
