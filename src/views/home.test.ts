// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountHomeView } from "./home";
import type { RecentList } from "../lib/storage";
import type { ListState } from "../../shared/types";
import { clearPendingImport, peekPendingImport, setPendingImport } from "../lib/pendingImport";

const trapRelease = vi.fn();
vi.mock("../lib/focusTrap", () => ({ trapFocus: () => trapRelease }));

const createList = vi.fn();
const fetchListState = vi.fn();
vi.mock("../lib/http", () => ({
  createList: (...args: unknown[]) => createList(...args),
  fetchListState: (...args: unknown[]) => fetchListState(...args),
}));

let recentLists: RecentList[] = [];
const forgetRecentList = vi.fn();
const touchRecentList = vi.fn();
const toggleFavoriteList = vi.fn();
vi.mock("../lib/storage", () => ({
  getRecentLists: () => recentLists,
  forgetRecentList: (...args: unknown[]) => forgetRecentList(...args),
  touchRecentList: (...args: unknown[]) => touchRecentList(...args),
  toggleFavoriteList: (...args: unknown[]) => toggleFavoriteList(...args),
}));

const openAccessibilityModal = vi.fn();
vi.mock("../components/accessibilityModal", () => ({ openAccessibilityModal: () => openAccessibilityModal() }));

function sampleState(overrides: Partial<ListState> = {}): ListState {
  return { code: "ABCDEF", name: "Courses", items: [], recipients: [], createdAt: 0, updatedAt: 0, ...overrides };
}

describe("mountHomeView", () => {
  let root: HTMLElement;
  let navigate: ReturnType<typeof vi.fn<(path: string) => void>>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-large-text");
    document.documentElement.removeAttribute("data-high-contrast");
    document.documentElement.removeAttribute("data-reduce-motion");
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
    recentLists = [];
    navigate = vi.fn<(path: string) => void>();
    vi.stubGlobal("alert", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("affiche la version du projet en pied d'accueil (VER-09)", () => {
    mountHomeView(root, navigate);
    expect(root.querySelector(".app-version")?.textContent).toBe("Version 9.9.9-test");
  });

  it("affiche l'accueil sans section « Listes récentes » quand il n'y en a pas", () => {
    mountHomeView(root, navigate);

    expect(root.querySelector("h1")?.textContent).toBe("DansMaHotte");
    expect(root.querySelector(".card h2")?.textContent).toBe("Nouvelle liste");
    expect(Array.from(root.querySelectorAll("h2")).some((h) => h.textContent === "Listes récentes")).toBe(false);
  });

  it("affiche les favoris et les autres listes récentes séparément", () => {
    recentLists = [
      { code: "AAAAAA", name: "Favorite", favorite: true, lastOpened: 1 },
      { code: "BBBBBB", name: "Normale", favorite: false, lastOpened: 2 },
    ];
    mountHomeView(root, navigate);

    const headings = Array.from(root.querySelectorAll("h3")).map((h) => h.textContent);
    expect(headings).toEqual(["Favoris", "Autres"]);
    expect(root.querySelector('.recent-favorite[data-code="AAAAAA"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector('.recent-favorite[data-code="BBBBBB"]')?.getAttribute("aria-pressed")).toBe("false");
  });

  it("n'affiche pas le sous-titre « Autres » s'il n'y a que des favoris", () => {
    recentLists = [{ code: "AAAAAA", name: "Favorite", favorite: true, lastOpened: 1 }];
    mountHomeView(root, navigate);

    const headings = Array.from(root.querySelectorAll("h3")).map((h) => h.textContent);
    expect(headings).toEqual(["Favoris"]);
  });

  it("n'affiche aucun sous-titre s'il n'y a que des listes non favorites", () => {
    recentLists = [{ code: "BBBBBB", name: "Normale", favorite: false, lastOpened: 2 }];
    mountHomeView(root, navigate);

    expect(root.querySelectorAll("h3")).toHaveLength(0);
  });

  it("échappe le nom d'une liste récente", () => {
    recentLists = [{ code: "AAAAAA", name: "<img src=x>", favorite: false, lastOpened: 1 }];
    mountHomeView(root, navigate);

    expect(root.querySelector(".recent-name")?.innerHTML).not.toContain("<img");
  });

  it("le bouton de thème cycle la préférence et se ré-affiche", () => {
    mountHomeView(root, navigate);
    const before = root.querySelector("#theme-toggle")?.getAttribute("aria-label");

    (root.querySelector("#theme-toggle") as HTMLButtonElement).click();

    const after = root.querySelector("#theme-toggle")?.getAttribute("aria-label");
    expect(after).not.toBe(before);
  });

  it("le bouton d'accessibilité ouvre la modale dédiée", () => {
    mountHomeView(root, navigate);

    (root.querySelector("#btn-accessibility") as HTMLButtonElement).click();

    expect(openAccessibilityModal).toHaveBeenCalledTimes(1);
  });

  it("créer une liste : appelle createList, mémorise la liste puis navigue", async () => {
    createList.mockResolvedValue(sampleState({ code: "NEWCOD", name: "Ma liste" }));
    mountHomeView(root, navigate);
    (root.querySelector("#create-name") as HTMLInputElement).value = "Ma liste";

    (root.querySelector("#create-form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());

    expect(createList).toHaveBeenCalledWith("Ma liste");
    expect(touchRecentList).toHaveBeenCalledWith("NEWCOD", "Ma liste");
    expect(navigate).toHaveBeenCalledWith("/l/NEWCOD");
  });

  it("créer une liste sans nom utilise le nom par défaut", async () => {
    createList.mockResolvedValue(sampleState());
    mountHomeView(root, navigate);

    (root.querySelector("#create-form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(createList).toHaveBeenCalled());

    expect(createList).toHaveBeenCalledWith("Liste de cadeaux");
  });

  it("un échec réseau à la création affiche une alerte et réactive le bouton", async () => {
    createList.mockRejectedValue(new Error("network"));
    mountHomeView(root, navigate);
    const btn = root.querySelector("#create-form button") as HTMLButtonElement;

    (root.querySelector("#create-form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(alert).toHaveBeenCalled());

    expect(btn.disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("rejoindre avec un code vide ne fait rien", () => {
    mountHomeView(root, navigate);

    (root.querySelector("#join-form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(fetchListState).not.toHaveBeenCalled();
  });

  it("rejoindre avec un code inconnu affiche un message d'erreur", async () => {
    fetchListState.mockResolvedValue(null);
    mountHomeView(root, navigate);
    (root.querySelector("#join-code") as HTMLInputElement).value = "zzzzzz";

    (root.querySelector("#join-form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(fetchListState).toHaveBeenCalled());

    expect(fetchListState).toHaveBeenCalledWith("ZZZZZZ");
    const errorEl = root.querySelector("#join-error") as HTMLElement;
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe("Aucune liste ne correspond à ce code.");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("rejoindre avec un code valide mémorise la liste puis navigue", async () => {
    fetchListState.mockResolvedValue(sampleState({ code: "ABCDEF", name: "Trouvée" }));
    mountHomeView(root, navigate);
    (root.querySelector("#join-code") as HTMLInputElement).value = "abcdef";

    (root.querySelector("#join-form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());

    expect(touchRecentList).toHaveBeenCalledWith("ABCDEF", "Trouvée");
    expect(navigate).toHaveBeenCalledWith("/l/ABCDEF");
  });

  it("une erreur réseau en rejoignant affiche un message d'erreur dédié", async () => {
    fetchListState.mockRejectedValue(new Error("network"));
    mountHomeView(root, navigate);
    (root.querySelector("#join-code") as HTMLInputElement).value = "abcdef";
    const btn = root.querySelector("#join-form button") as HTMLButtonElement;

    (root.querySelector("#join-form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(btn.disabled).toBe(false));

    const errorEl = root.querySelector("#join-error") as HTMLElement;
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe("Erreur réseau, réessaie.");
  });

  it("cliquer sur une liste récente navigue vers son code", () => {
    recentLists = [{ code: "AAAAAA", name: "Favorite", favorite: false, lastOpened: 1 }];
    mountHomeView(root, navigate);

    (root.querySelector(".recent-open") as HTMLButtonElement).click();

    expect(navigate).toHaveBeenCalledWith("/l/AAAAAA");
  });

  it("basculer un favori l'appelle et ré-affiche sans naviguer", () => {
    recentLists = [{ code: "AAAAAA", name: "Favorite", favorite: false, lastOpened: 1 }];
    mountHomeView(root, navigate);

    (root.querySelector(".recent-favorite") as HTMLButtonElement).click();

    expect(toggleFavoriteList).toHaveBeenCalledWith("AAAAAA");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("oublier une liste récente l'appelle et ré-affiche sans naviguer", () => {
    recentLists = [{ code: "AAAAAA", name: "Favorite", favorite: false, lastOpened: 1 }];
    mountHomeView(root, navigate);

    (root.querySelector(".recent-forget") as HTMLButtonElement).click();

    expect(forgetRecentList).toHaveBeenCalledWith("AAAAAA");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("un favori sans code (cache local-storage corrompu) n'appelle pas toggleFavoriteList", () => {
    recentLists = [{ code: "", name: "Corrompue", favorite: false, lastOpened: 1 }];
    mountHomeView(root, navigate);

    expect(() => (root.querySelector(".recent-favorite") as HTMLButtonElement).click()).not.toThrow();

    expect(toggleFavoriteList).not.toHaveBeenCalled();
  });

  it("oublier une liste sans code (cache local-storage corrompu) n'appelle pas forgetRecentList", () => {
    recentLists = [{ code: "", name: "Corrompue", favorite: false, lastOpened: 1 }];
    mountHomeView(root, navigate);

    expect(() => (root.querySelector(".recent-forget") as HTMLButtonElement).click()).not.toThrow();

    expect(forgetRecentList).not.toHaveBeenCalled();
  });

  it("le nettoyage retourné est un no-op", () => {
    const cleanup = mountHomeView(root, navigate);
    expect(() => cleanup()).not.toThrow();
  });

  describe("invitation à créer une liste depuis un lien compact", () => {
    const payload = { name: "Noël", items: [], recipients: [{ id: "r1", name: "Mamie", order: 0 }] };
    const overlay = () => document.querySelector(".modal-overlay") as HTMLElement | null;

    beforeEach(() => {
      clearPendingImport();
      trapRelease.mockClear();
    });

    afterEach(() => {
      // Referme toute invitation restée ouverte (son écouteur clavier est sur document).
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    it("n'affiche rien sans instantané en attente", () => {
      mountHomeView(root, navigate);
      expect(overlay()).toBeNull();
    });

    it("résume le contenu de l'instantané", () => {
      setPendingImport({ name: "Noël", items: [{ id: "i" } as never, { id: "j" } as never], recipients: payload.recipients });
      mountHomeView(root, navigate);
      expect(overlay()!.querySelector("p")!.textContent).toBe("Ce lien contient 2 cadeau(x) et 1 personne(s). Créer une nouvelle liste à partir de ce contenu ?");
    });

    it.each([["#pending-import-cancel"], [".modal-close"]])("%s ignore l'invitation, efface l'instantané et rend le focus", (selector) => {
      setPendingImport(payload);
      mountHomeView(root, navigate);
      (overlay()!.querySelector(selector) as HTMLElement).click();
      expect(overlay()).toBeNull();
      expect(peekPendingImport()).toBeNull();
      expect(trapRelease).toHaveBeenCalledOnce();
    });

    it("Échap ignore l'invitation une seule fois ; une autre touche ne fait rien", () => {
      setPendingImport(payload);
      mountHomeView(root, navigate);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      expect(overlay()).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(overlay()).toBeNull();
      expect(peekPendingImport()).toBeNull();
      expect(trapRelease).toHaveBeenCalledOnce();
    });

    it("un clic sur le fond ignore l'invitation, un clic dans la fenêtre non", () => {
      setPendingImport(payload);
      mountHomeView(root, navigate);
      (overlay()!.querySelector(".modal") as HTMLElement).click();
      expect(overlay()).not.toBeNull();
      overlay()!.click();
      expect(overlay()).toBeNull();
      expect(peekPendingImport()).toBeNull();
    });

    it("créer : désactive le bouton pendant l'appel, mémorise la liste, ferme puis navigue", async () => {
      let resolve!: (s: ListState) => void;
      createList.mockReturnValue(new Promise<ListState>((r) => (resolve = r)));
      setPendingImport(payload);
      mountHomeView(root, navigate);
      const btn = overlay()!.querySelector("#pending-import-create") as HTMLButtonElement;

      btn.click();
      expect(btn.disabled).toBe(true);
      expect(createList).toHaveBeenCalledWith("Noël");

      resolve(sampleState({ code: "NEWCOD", name: "Noël" }));
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/l/NEWCOD"));
      expect(touchRecentList).toHaveBeenCalledWith("NEWCOD", "Noël");
      expect(overlay()).toBeNull();
      expect(trapRelease).toHaveBeenCalledOnce();
      // L'instantané reste en attente : la vue liste le consomme une fois connectée.
      expect(peekPendingImport()).toBe(payload);
    });

    it("sans nom, utilise le nom par défaut", async () => {
      createList.mockResolvedValue(sampleState());
      setPendingImport({ ...payload, name: "" });
      mountHomeView(root, navigate);
      (overlay()!.querySelector("#pending-import-create") as HTMLButtonElement).click();
      await vi.waitFor(() => expect(createList).toHaveBeenCalledWith("Liste de cadeaux"));
    });

    it("un échec réseau affiche l'alerte exacte, réactive le bouton et garde l'invitation", async () => {
      createList.mockRejectedValue(new Error("réseau"));
      setPendingImport(payload);
      mountHomeView(root, navigate);
      const btn = overlay()!.querySelector("#pending-import-create") as HTMLButtonElement;
      btn.click();
      await vi.waitFor(() => expect(alert).toHaveBeenCalledWith("Impossible de créer la liste. Vérifie ta connexion internet."));
      expect(btn.disabled).toBe(false);
      expect(overlay()).not.toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe("détails de rendu et de comportement", () => {
    const submit = (form: Element) => {
      const event = new Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(event);
      return event;
    };
    const strayText = () =>
      Array.from(root.querySelectorAll(".home, .card, .recent-list")).flatMap((el) =>
        Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== "")
          .map((n) => n.textContent),
      );
    const deferred = <T,>() => {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
    const fav = (code: string, favorite: boolean): RecentList => ({ code, name: `Liste ${code}`, favorite, lastOpened: 1 });

    it("n'insère aucun texte parasite, quelle que soit la combinaison de listes récentes", () => {
      for (const lists of [[], [fav("AAAAAA", true), fav("BBBBBB", true)], [fav("CCCCCC", false), fav("DDDDDD", false)], [fav("AAAAAA", true), fav("BBBBBB", true), fav("CCCCCC", false), fav("DDDDDD", false)]]) {
        recentLists = lists;
        mountHomeView(root, navigate);
        expect(strayText()).toEqual([]);
      }
    });

    it("libellé et état des boutons favori", () => {
      recentLists = [fav("AAAAAA", true), fav("BBBBBB", false)];
      mountHomeView(root, navigate);
      const on = root.querySelector('.recent-favorite[data-code="AAAAAA"]')!;
      const off = root.querySelector('.recent-favorite[data-code="BBBBBB"]')!;
      expect(on.getAttribute("aria-label")).toBe("Retirer des favoris");
      expect(on.getAttribute("aria-pressed")).toBe("true");
      expect(off.getAttribute("aria-label")).toBe("Ajouter aux favoris");
      expect(off.getAttribute("aria-pressed")).toBe("false");
    });

    it("le bouton de thème affiche l'icône du thème courant", () => {
      for (const [theme, label] of [["system", "Auto"], ["light", "Clair"], ["dark", "Sombre"]] as const) {
        localStorage.setItem("dmh:theme", theme);
        mountHomeView(root, navigate);
        const btn = root.querySelector("#theme-toggle")!;
        expect(btn.getAttribute("aria-label")).toBe(`Thème : ${label}`);
        expect(btn.querySelector("svg")).not.toBeNull();
        expect(btn.textContent).not.toContain("undefined");
        root.dataset[theme] = btn.innerHTML.replace(/\s+/g, " ");
      }
      expect(new Set(Object.values(root.dataset)).size).toBe(3);
    });

    it("les deux formulaires bloquent l'envoi natif du navigateur", () => {
      mountHomeView(root, navigate);
      expect(submit(root.querySelector("#create-form")!).defaultPrevented).toBe(true);
      expect(submit(root.querySelector("#join-form")!).defaultPrevented).toBe(true);
    });

    it("création : bouton désactivé pendant l'appel, nom recadré, message d'échec exact", async () => {
      const call = deferred<ListState>();
      createList.mockReturnValue(call.promise);
      mountHomeView(root, navigate);
      const btn = root.querySelector("#create-form button") as HTMLButtonElement;
      (root.querySelector("#create-name") as HTMLInputElement).value = "  Ma liste  ";

      submit(root.querySelector("#create-form")!);
      expect(btn.disabled).toBe(true);
      expect(createList).toHaveBeenCalledWith("Ma liste");

      call.reject(new Error("réseau"));
      await vi.waitFor(() => expect(alert).toHaveBeenCalledWith("Impossible de créer la liste. Vérifie ta connexion internet."));
    });

    it("rejoindre : code recadré, bouton désactivé pendant l'appel, erreur masquée à chaque tentative", async () => {
      fetchListState.mockResolvedValueOnce(null);
      mountHomeView(root, navigate);
      const input = root.querySelector("#join-code") as HTMLInputElement;
      const error = root.querySelector("#join-error") as HTMLElement;
      const btn = root.querySelector("#join-form button") as HTMLButtonElement;
      input.value = "  abc123  ";

      submit(root.querySelector("#join-form")!);
      await vi.waitFor(() => expect(error.hidden).toBe(false));
      expect(fetchListState).toHaveBeenCalledWith("ABC123");

      // Une nouvelle tentative (même vide) masque d'abord l'erreur précédente.
      input.value = "";
      submit(root.querySelector("#join-form")!);
      expect(error.hidden).toBe(true);

      const call = deferred<ListState | null>();
      fetchListState.mockReturnValueOnce(call.promise);
      input.value = "zzz999";
      submit(root.querySelector("#join-form")!);
      expect(btn.disabled).toBe(true);
      call.resolve(null);
      await vi.waitFor(() => expect(btn.disabled).toBe(false));
    });

    it("basculer un favori ou oublier une liste redessine l'accueil", () => {
      recentLists = [fav("AAAAAA", false)];
      mountHomeView(root, navigate);
      const mark = (): void => root.querySelector(".home")!.setAttribute("data-mark", "1");
      const marked = (): boolean => root.querySelector(".home")!.hasAttribute("data-mark");

      mark();
      (root.querySelector(".recent-favorite") as HTMLButtonElement).click();
      expect(marked()).toBe(false);

      mark();
      (root.querySelector(".recent-forget") as HTMLButtonElement).click();
      expect(marked()).toBe(false);
    });

  });
});
