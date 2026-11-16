function createBanner(id: string, html: string): HTMLElement {
  const banner = document.createElement("div");
  banner.id = id;
  banner.className = "pwa-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = html;
  document.body.append(banner);
  return banner;
}

/** Annonce qu'une nouvelle version est prête ; « Recharger » l'applique, « Plus tard » ferme le bandeau. */
export function showUpdateBanner(onReload: () => void): void {
  const banner = createBanner(
    "update-banner",
    `<span>Une nouvelle version est disponible.</span>
    <button class="btn" id="update-reload" type="button">Recharger</button>
    <button class="btn" id="update-later" type="button">Plus tard</button>`,
  );
  banner.querySelector("#update-reload")!.addEventListener("click", onReload);
  banner.querySelector("#update-later")!.addEventListener("click", () => banner.remove());
}

/** Bandeau « hors ligne », affiché tant que le navigateur n'a pas de réseau. */
export function watchOffline(): void {
  const banner = createBanner(
    "offline-banner",
    "<span>Hors ligne : les modifications seront envoyées au retour du réseau.</span>",
  );
  banner.hidden = navigator.onLine;
  window.addEventListener("online", () => {
    banner.hidden = true;
  });
  window.addEventListener("offline", () => {
    banner.hidden = false;
  });
}
