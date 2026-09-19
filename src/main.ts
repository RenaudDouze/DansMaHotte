import "./style.css";
import { mountHomeView } from "./views/home";
import { mountListView } from "./views/list";
import { applyTheme, getThemePreference } from "./lib/theme";
import { applyAccessibilityPreference, getAccessibilityPreference } from "./lib/accessibilityPreference";
import { appPath, routePath } from "./lib/basePath";
import { decodeCompactShare } from "./lib/compactShare";
import { setPendingImport } from "./lib/pendingImport";

// Appliqué avant le premier rendu pour éviter un flash de thème clair suivi
// d'un bascule sombre si l'utilisateur a choisi un thème manuel.
applyTheme(getThemePreference());
applyAccessibilityPreference(getAccessibilityPreference());

// Un lien compact (voir src/lib/importExport.ts's buildCompactShareUrl)
// porte son instantané dans ?import= : décodé une fois ici, avant le premier
// rendu, puis retiré de l'URL pour ne pas être redécodé à chaque navigation
// (popstate) ni réapparaître si le lien est partagé/rechargé tel quel.
(function consumePendingImportFromUrl(): void {
  const params = new URLSearchParams(location.search);
  const encoded = params.get("import");
  if (encoded === null) return;
  const payload = decodeCompactShare(encoded);
  params.delete("import");
  const query = params.toString();
  history.replaceState({}, "", location.pathname + (query ? `?${query}` : "") + location.hash);
  if (payload) setPendingImport(payload);
})();

const app = document.getElementById("app")!;
let cleanup: (() => void) | null = null;

function navigate(path: string, replace = false): void {
  const target = appPath(path);
  if (location.pathname !== target) {
    if (replace) history.replaceState({}, "", target);
    else history.pushState({}, "", target);
  }
  render();
}

function render(): void {
  cleanup?.();
  cleanup = null;

  const match = routePath().match(/^\/l\/([A-Za-z0-9]+)\/?$/);
  if (match) {
    cleanup = mountListView(app, match[1].toUpperCase(), navigate);
  } else {
    cleanup = mountHomeView(app, navigate);
  }
}

window.addEventListener("popstate", render);
render();
