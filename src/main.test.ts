// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeCompactShare } from "./lib/compactShare";

type Navigate = (path: string, replace?: boolean) => void;
let capturedNavigate: Navigate | undefined;

const cleanupHome = vi.fn();
const cleanupList = vi.fn();
const mountHomeView = vi.fn((_root: HTMLElement, navigate: Navigate) => {
  capturedNavigate = navigate;
  return cleanupHome;
});
const mountListView = vi.fn((_root: HTMLElement, _code: string, navigate: Navigate) => {
  capturedNavigate = navigate;
  return cleanupList;
});

vi.mock("./views/home", () => ({ mountHomeView: (...a: Parameters<typeof mountHomeView>) => mountHomeView(...a) }));
vi.mock("./views/list", () => ({ mountListView: (...a: Parameters<typeof mountListView>) => mountListView(...a) }));

// Enregistrement du service worker et bandeaux PWA : remplacés par des espions
// (le module « virtual:pwa-register » n'existe que dans un build Vite).
const applyUpdate = vi.fn(async () => {});
const registerSW = vi.fn((_options: { onNeedRefresh: () => void }) => applyUpdate);
const showUpdateBanner = vi.fn();
const watchOffline = vi.fn();
vi.mock("virtual:pwa-register", () => ({ registerSW: (...a: Parameters<typeof registerSW>) => registerSW(...a) }));
vi.mock("./components/pwaBanner", () => ({
  showUpdateBanner: (...a: Parameters<typeof showUpdateBanner>) => showUpdateBanner(...a),
  watchOffline: () => watchOffline(),
}));

// main.ts est un point d'entrée à effets de bord (aucun export) : chaque test
// le ré-importe à neuf (resetModules) et retire l'écouteur popstate qu'il a
// posé sur window, pour que les rendus d'un test précédent ne s'ajoutent pas.
const popstateListeners: EventListener[] = [];

async function boot(url: string): Promise<HTMLElement> {
  document.body.innerHTML = '<div id="app"></div>';
  history.replaceState({}, "", url);
  vi.resetModules();
  await import("./main");
  return document.getElementById("app")!;
}

// Même registre de modules que main.ts (resetModules dans boot) : à importer après coup.
async function pending() {
  const { peekPendingImport } = await import("./lib/pendingImport");
  return peekPendingImport();
}

describe("main (bootstrap applicatif)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-large-text");
    mountHomeView.mockClear();
    mountListView.mockClear();
    cleanupHome.mockClear();
    cleanupList.mockClear();
    registerSW.mockClear();
    applyUpdate.mockClear();
    showUpdateBanner.mockClear();
    watchOffline.mockClear();
    const original = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation(((type: string, listener: EventListener, options?: unknown) => {
      if (type === "popstate") popstateListeners.push(listener);
      original(type, listener, options as boolean);
    }) as typeof window.addEventListener);
  });

  afterEach(() => {
    for (const l of popstateListeners.splice(0)) window.removeEventListener("popstate", l);
    vi.restoreAllMocks();
  });

  it("applique le thème et l'accessibilité enregistrés avant le premier rendu", async () => {
    localStorage.setItem("dmh:theme", "dark");
    localStorage.setItem("dmh:a11y", JSON.stringify({ largeText: true, highContrast: false, reduceMotion: false }));
    await boot("/");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.hasAttribute("data-large-text")).toBe(true);
  });

  it("monte l'accueil sur « / »", async () => {
    const app = await boot("/");
    expect(mountHomeView).toHaveBeenCalledTimes(1);
    expect(mountHomeView).toHaveBeenCalledWith(app, expect.any(Function));
    expect(mountListView).not.toHaveBeenCalled();
  });

  it("monte la vue liste sur « /l/code » (code en majuscules), avec ou sans slash final", async () => {
    const app = await boot("/l/abc123");
    expect(mountListView).toHaveBeenCalledWith(app, "ABC123", expect.any(Function));
    expect(mountHomeView).not.toHaveBeenCalled();
    await boot("/l/abc123/");
    expect(mountListView).toHaveBeenLastCalledWith(app, "ABC123", expect.any(Function));
  });

  it.each([["/autre/l/abc"], ["/l/abc/suite"], ["/l/"], ["/l/a-b"]])("%s n'est pas une liste : monte l'accueil", async (url) => {
    await boot(url);
    expect(mountListView).not.toHaveBeenCalled();
    expect(mountHomeView).toHaveBeenCalledTimes(1);
  });

  it("naviguer pousse l'historique, nettoie la vue précédente et monte la suivante", async () => {
    const app = await boot("/");
    const push = vi.spyOn(history, "pushState");
    const replace = vi.spyOn(history, "replaceState");

    capturedNavigate!("/l/abcdef");

    expect(push).toHaveBeenCalledWith({}, "", "/l/abcdef");
    expect(replace).not.toHaveBeenCalled();
    expect(location.pathname).toBe("/l/abcdef");
    expect(cleanupHome).toHaveBeenCalledOnce();
    expect(mountListView).toHaveBeenCalledWith(app, "ABCDEF", expect.any(Function));
  });

  it("naviguer en mode « remplacer » n'ajoute pas d'entrée d'historique", async () => {
    await boot("/l/abcdef");
    const push = vi.spyOn(history, "pushState");
    const replace = vi.spyOn(history, "replaceState");

    capturedNavigate!("/", true);

    expect(replace).toHaveBeenCalledWith({}, "", "/");
    expect(push).not.toHaveBeenCalled();
    expect(cleanupList).toHaveBeenCalledOnce();
    expect(mountHomeView).toHaveBeenCalledOnce();
  });

  it("naviguer vers le chemin courant ne touche pas l'historique mais re-rend", async () => {
    await boot("/");
    const push = vi.spyOn(history, "pushState");
    const replace = vi.spyOn(history, "replaceState");

    capturedNavigate!("/");

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(mountHomeView).toHaveBeenCalledTimes(2);
  });

  it("popstate re-rend selon le chemin courant", async () => {
    const app = await boot("/");
    history.replaceState({}, "", "/l/zzzzzz");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(cleanupHome).toHaveBeenCalledOnce();
    expect(mountListView).toHaveBeenCalledWith(app, "ZZZZZZ", expect.any(Function));
  });

  describe("lien compact (?import=)", () => {
    const payload = { name: "Noël", items: [], recipients: [{ id: "r1", name: "Mamie", order: 0 }] };

    it("décode l'instantané, le garde en attente et retire le paramètre de l'URL (autres paramètres et ancre conservés)", async () => {
      const replace = vi.spyOn(history, "replaceState");
      await boot(`/?a=1&import=${encodeURIComponent(encodeCompactShare(payload))}#ancre`);
      expect(await pending()).toEqual(payload);
      expect(location.search).toBe("?a=1");
      expect(location.hash).toBe("#ancre");
      expect(replace).toHaveBeenCalledWith({}, "", "/?a=1#ancre");
    });

    it("sans autre paramètre, l'URL redevient celle de la page", async () => {
      await boot(`/?import=${encodeURIComponent(encodeCompactShare(payload))}`);
      expect(location.search).toBe("");
      expect(location.pathname + location.search).toBe("/");
    });

    it("un paramètre invalide est retiré de l'URL sans rien mettre en attente", async () => {
      await boot("/?import=corrompu");
      expect(await pending()).toBeNull();
      expect(location.search).toBe("");
    });

    it("sans paramètre, l'URL n'est pas modifiée", async () => {
      document.body.innerHTML = '<div id="app"></div>';
      history.replaceState({}, "", "/?a=1");
      const replace = vi.spyOn(history, "replaceState");
      vi.resetModules();
      await import("./main");
      expect(replace).not.toHaveBeenCalled();
      expect(await pending()).toBeNull();
    });
  });

  describe("PWA", () => {
    it("surveille l'état hors ligne au démarrage", async () => {
      await boot("/");
      expect(watchOffline).toHaveBeenCalledTimes(1);
    });

    it("enregistre le service worker et annonce une nouvelle version sans recharger", async () => {
      await boot("/");
      expect(registerSW).toHaveBeenCalledTimes(1);
      expect(showUpdateBanner).not.toHaveBeenCalled();
      registerSW.mock.calls[0][0].onNeedRefresh();
      expect(showUpdateBanner).toHaveBeenCalledTimes(1);
      expect(applyUpdate).not.toHaveBeenCalled();
    });

    it("recharge avec la nouvelle version quand l'utilisateur accepte", async () => {
      await boot("/");
      registerSW.mock.calls[0][0].onNeedRefresh();
      (showUpdateBanner.mock.calls[0][0] as () => void)();
      expect(applyUpdate).toHaveBeenCalledWith(true);
    });
  });
});
