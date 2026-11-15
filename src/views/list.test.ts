// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountListView } from "./list";
import { cacheListState, getCachedListState, getRecentLists } from "../lib/storage";
import { peekPendingImport, setPendingImport, clearPendingImport } from "../lib/pendingImport";
import type { ClientMessage, Item, ListState, Recipient } from "../../shared/types";

// --- ws.ts : la vraie classe ouvrirait une connexion WebSocket réelle ---
// vi.mock() est hoisté en tête de fichier : la classe et la liste de ses
// instances doivent l'être aussi (vi.hoisted) pour être déjà initialisées
// quand la factory s'exécute.
type Listener<T> = (arg: T) => void;
const { FakeListConnection, fakeConnectionInstances } = vi.hoisted(() => {
  const instances: unknown[] = [];
  class Impl {
    send = vi.fn();
    connect = vi.fn();
    disconnect = vi.fn();
    private stateListeners: Listener<unknown>[] = [];
    private errorListeners: Listener<unknown>[] = [];
    private connListeners: Listener<unknown>[] = [];

    constructor(public code: string) {
      instances.push(this);
    }
    onState(l: Listener<unknown>) {
      this.stateListeners.push(l);
      return () => (this.stateListeners = this.stateListeners.filter((x) => x !== l));
    }
    onError(l: Listener<unknown>) {
      this.errorListeners.push(l);
      return () => (this.errorListeners = this.errorListeners.filter((x) => x !== l));
    }
    onConnectionChange(l: Listener<unknown>) {
      this.connListeners.push(l);
      return () => (this.connListeners = this.connListeners.filter((x) => x !== l));
    }
    emitState(s: unknown) {
      for (const l of [...this.stateListeners]) l(s);
    }
    emitError(m: unknown) {
      for (const l of [...this.errorListeners]) l(m);
    }
    emitConnection(c: unknown) {
      for (const l of [...this.connListeners]) l(c);
    }
  }
  return { FakeListConnection: Impl, fakeConnectionInstances: instances };
});
type FakeListConnection = InstanceType<typeof FakeListConnection> & {
  send: ReturnType<typeof vi.fn<(msg: ClientMessage) => void>>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  emitState: (s: ListState) => void;
  emitError: (m: string) => void;
  emitConnection: (c: boolean) => void;
};
vi.mock("../lib/ws", () => ({ ListConnection: FakeListConnection }));

const fetchListState = vi.fn();
const uploadItemImage = vi.fn();
const deleteItemImage = vi.fn();
vi.mock("../lib/http", () => ({
  fetchListState: (...a: unknown[]) => fetchListState(...a),
  uploadItemImage: (...a: unknown[]) => uploadItemImage(...a),
  deleteItemImage: (...a: unknown[]) => deleteItemImage(...a),
  itemImageUrl: (code: string, id: string, version: number) => `/img/${code}/${id}?v=${version}`,
}));

const openShareModal = vi.fn();
vi.mock("../components/shareModal", () => ({ openShareModal: (...a: unknown[]) => openShareModal(...a) }));

const openCompactShareModal = vi.fn();
vi.mock("../components/compactShareModal", () => ({ openCompactShareModal: (...a: unknown[]) => openCompactShareModal(...a) }));

const openAccessibilityModal = vi.fn();
vi.mock("../components/accessibilityModal", () => ({ openAccessibilityModal: () => openAccessibilityModal() }));

const exportListState = vi.fn();
vi.mock("../lib/importExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/importExport")>();
  return { ...actual, exportListState: (...a: unknown[]) => exportListState(...a) };
});

interface DndCall {
  container: HTMLElement;
  opts: { containerSelector: string; itemSelector: string; handleSelector: string; onDrop: (el: HTMLElement) => void };
  dispose: ReturnType<typeof vi.fn>;
}
const dndCalls: DndCall[] = [];
const enableDragReorder = vi.fn((container: HTMLElement, opts: DndCall["opts"]) => {
  const dispose = vi.fn();
  dndCalls.push({ container, opts, dispose });
  return dispose;
});
vi.mock("../lib/dnd", () => ({ enableDragReorder: (...a: Parameters<typeof enableDragReorder>) => enableDragReorder(...a) }));

interface SwipeCall {
  opts: { onDelete: (el: HTMLElement) => void };
}
const swipeCalls: SwipeCall[] = [];
const enableSwipeToDelete = vi.fn((_container: HTMLElement, opts: SwipeCall["opts"]) => {
  swipeCalls.push({ opts });
  return vi.fn();
});
vi.mock("../lib/swipe", () => ({ enableSwipeToDelete: (...a: Parameters<typeof enableSwipeToDelete>) => enableSwipeToDelete(...a) }));

interface ConfirmClickCall {
  button: HTMLElement;
  opts: { onConfirm: () => void; isDisabled?: () => boolean };
}
const confirmClickCalls: ConfirmClickCall[] = [];
const wireConfirmClick = vi.fn((button: HTMLElement, opts: ConfirmClickCall["opts"]) => {
  confirmClickCalls.push({ button, opts });
});
vi.mock("../lib/confirmClick", () => ({ wireConfirmClick: (...a: Parameters<typeof wireConfirmClick>) => wireConfirmClick(...a) }));

interface StartEditCall {
  el: HTMLElement;
  opts: { value: string; placeholder?: string; onCommit: (value: string) => void };
}
const startEditCalls: StartEditCall[] = [];
const startEdit = vi.fn((el: HTMLElement, opts: StartEditCall["opts"]) => {
  startEditCalls.push({ el, opts });
});
vi.mock("../lib/editable", () => ({ startEdit: (...a: Parameters<typeof startEdit>) => startEdit(...a) }));

const focusReleases: ReturnType<typeof vi.fn>[] = [];
const trapFocus = vi.fn(() => {
  const release = vi.fn();
  focusReleases.push(release);
  return release;
});
vi.mock("../lib/focusTrap", () => ({ trapFocus: (...a: Parameters<typeof trapFocus>) => trapFocus(...a) }));

function sampleState(overrides: Partial<ListState> = {}): ListState {
  return { code: "ABCDEF", name: "Noël", items: [], recipients: [], createdAt: 0, updatedAt: 0, ...overrides };
}
function makeItem(overrides: Partial<Item> = {}): Item {
  return { id: "i1", name: "Livre", recipientId: null, checked: false, order: 0, hasImage: false, imageVersion: 0, createdAt: 0, updatedAt: 0, ...overrides };
}
function makeRecipient(overrides: Partial<Recipient> = {}): Recipient {
  return { id: "r1", name: "Mamie", order: 0, ...overrides };
}

function findDnd(handleSelector: string): DndCall {
  const call = [...dndCalls].reverse().find((c) => c.opts.handleSelector === handleSelector);
  if (!call) throw new Error(`no enableDragReorder call for ${handleSelector}`);
  return call;
}
function findSwipe(): SwipeCall {
  const call = swipeCalls[swipeCalls.length - 1];
  if (!call) throw new Error("no enableSwipeToDelete call");
  return call;
}
function findConfirm(button: HTMLElement): ConfirmClickCall {
  const call = confirmClickCalls.find((c) => c.button === button);
  if (!call) throw new Error("no wireConfirmClick call for this button");
  return call;
}
function findStartEdit(el: HTMLElement): StartEditCall {
  const call = [...startEditCalls].reverse().find((c) => c.el === el);
  if (!call) throw new Error("no startEdit call for this element");
  return call;
}

describe("mountListView", () => {
  let root: HTMLElement;
  let navigate: ReturnType<typeof vi.fn<(path: string) => void>>;
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    clearPendingImport();
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
    navigate = vi.fn<(path: string) => void>();
    fakeConnectionInstances.length = 0;
    dndCalls.length = 0;
    swipeCalls.length = 0;
    confirmClickCalls.length = 0;
    startEditCalls.length = 0;
    focusReleases.length = 0;
    fetchListState.mockReset().mockResolvedValue(sampleState());
    uploadItemImage.mockReset().mockResolvedValue(undefined);
    deleteItemImage.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function mount(fetched: ListState | null = sampleState(), fetchError = false): Promise<FakeListConnection> {
    if (fetchError) fetchListState.mockRejectedValue(new Error("network"));
    else fetchListState.mockResolvedValue(fetched);
    cleanup = mountListView(root, "ABCDEF", navigate);
    await vi.waitFor(() => expect(fetchListState).toHaveBeenCalled());
    await vi.waitFor(() => expect(fakeConnectionInstances.length).toBeGreaterThan(0));
    const conn = fakeConnectionInstances[fakeConnectionInstances.length - 1] as FakeListConnection;
    await vi.waitFor(() => expect(conn.connect).toHaveBeenCalled());
    return conn;
  }

  const names = () => Array.from(root.querySelectorAll(".item-name")).map((el) => el.textContent);
  const personNames = () => Array.from(root.querySelectorAll(".person-name")).map((el) => el.textContent);
  const rowOf = (id: string) => root.querySelector(`.item[data-id="${id}"]`) as HTMLElement;
  const keydown = (key: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  const strayText = (selector: string) =>
    Array.from(document.querySelectorAll(selector)).flatMap((el) =>
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== "")
        .map((n) => n.textContent),
    );
  const openMenuAction = (action: string) => (root.querySelector(`[data-action="${action}"]`) as HTMLElement).click();

  describe("chargement", () => {
    it("affiche un message de chargement puis la liste une fois récupérée", async () => {
      fetchListState.mockResolvedValue(sampleState({ name: "Ma liste" }));
      cleanup = mountListView(root, "ABCDEF", navigate);
      expect(root.textContent).toContain("Chargement");
      expect(root.querySelector("#list-title")).toBeNull();

      await vi.waitFor(() => expect(root.querySelector("#list-title")).not.toBeNull());
      expect(root.querySelector("#list-title")?.textContent).toBe("Ma liste");
      expect(root.textContent).not.toContain("Chargement");
    });

    it("mémorise la liste récupérée (cache et listes récentes) et connecte la synchronisation", async () => {
      const conn = await mount(sampleState({ name: "Récupérée" }));
      expect(getCachedListState("ABCDEF")?.name).toBe("Récupérée");
      expect(getRecentLists().find((r) => r.code === "ABCDEF")?.name).toBe("Récupérée");
      expect(conn.code).toBe("ABCDEF");
    });

    it("affiche immédiatement une liste en cache, puis la met à jour après la réponse serveur", async () => {
      cacheListState(sampleState({ name: "Cache" }));
      fetchListState.mockResolvedValue(sampleState({ name: "Fraîche" }));
      cleanup = mountListView(root, "ABCDEF", navigate);

      expect(root.querySelector("#list-title")?.textContent).toBe("Cache");
      expect(root.textContent).not.toContain("Chargement");
      await vi.waitFor(() => expect(root.querySelector("#list-title")?.textContent).toBe("Fraîche"));
    });

    it("« liste introuvable » si le serveur renvoie 404 sans cache, avec retour à l'accueil, sans connexion", async () => {
      fetchListState.mockResolvedValue(null);
      cleanup = mountListView(root, "ABCDEF", navigate);
      await vi.waitFor(() => expect(root.textContent).toContain("Aucune liste ne correspond au code"));
      expect(root.querySelector("strong")?.textContent).toBe("ABCDEF");

      (root.querySelector("#btn-home") as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith("/");
      expect((fakeConnectionInstances[0] as FakeListConnection).connect).not.toHaveBeenCalled();
    });

    it("échappe le code dans le message « introuvable »", async () => {
      fetchListState.mockResolvedValue(null);
      cleanup = mountListView(root, "<i>", navigate);
      await vi.waitFor(() => expect(root.querySelector("strong")).not.toBeNull());
      expect(root.querySelector("strong i")).toBeNull();
    });

    it("garde la liste en cache affichée si le serveur renvoie 404", async () => {
      cacheListState(sampleState({ name: "Cache" }));
      fetchListState.mockResolvedValue(null);
      cleanup = mountListView(root, "ABCDEF", navigate);
      await vi.waitFor(() => expect((fakeConnectionInstances[0] as FakeListConnection).connect).toHaveBeenCalled());
      expect(root.querySelector("#list-title")?.textContent).toBe("Cache");
      expect(root.textContent).not.toContain("Aucune liste ne correspond");
    });

    it("affiche une erreur réseau avec un bouton réessayer si aucun cache n'est disponible", async () => {
      await mount(null, true);
      expect(root.textContent).toContain("Impossible de charger la liste. Vérifie ta connexion.");
      const reload = vi.fn();
      vi.stubGlobal("location", { ...location, reload });
      (root.querySelector("#retry") as HTMLButtonElement).click();
      expect(reload).toHaveBeenCalled();
    });

    it("une erreur réseau n'empêche pas l'affichage si une liste en cache existe", async () => {
      cacheListState(sampleState({ name: "Cache" }));
      fetchListState.mockRejectedValue(new Error("network"));
      cleanup = mountListView(root, "ABCDEF", navigate);
      await vi.waitFor(() => expect((fakeConnectionInstances[0] as FakeListConnection).connect).toHaveBeenCalled());
      expect(root.querySelector("#list-title")?.textContent).toBe("Cache");
      expect(root.textContent).not.toContain("Impossible de charger");
    });

    it("applique l'instantané d'un lien compact en attente (remplacement) dès le montage", async () => {
      const payload = { name: "Noël", items: [], recipients: [makeRecipient()] };
      setPendingImport(payload);
      const conn = await mount();
      expect(conn.send).toHaveBeenCalledWith({ type: "importState", mode: "replace", data: payload });
      expect(peekPendingImport()).toBeNull();
    });

    it("n'envoie rien à l'ouverture s'il n'y a pas d'instantané en attente", async () => {
      const conn = await mount();
      expect(conn.send).not.toHaveBeenCalled();
    });
  });

  describe("synchronisation en direct", () => {
    it("une mise à jour reçue redessine la liste et la met en cache", async () => {
      const conn = await mount();
      conn.emitState(sampleState({ name: "Diffusée", items: [makeItem({ id: "a", name: "Écharpe" })] }));
      expect(root.querySelector("#list-title")?.textContent).toBe("Diffusée");
      expect(names()).toEqual(["Écharpe"]);
      expect(getCachedListState("ABCDEF")?.name).toBe("Diffusée");
    });

    it("une mise à jour ne touche pas aux listes récentes (seule l'ouverture le fait)", async () => {
      const conn = await mount(sampleState({ name: "Ouverte" }));
      conn.emitState(sampleState({ name: "Diffusée" }));
      expect(getRecentLists().find((r) => r.code === "ABCDEF")?.name).toBe("Ouverte");
    });

    it("la première mise à jour sort de l'écran « introuvable »", async () => {
      fetchListState.mockResolvedValue(null);
      cleanup = mountListView(root, "ABCDEF", navigate);
      await vi.waitFor(() => expect(root.textContent).toContain("Aucune liste ne correspond"));
      (fakeConnectionInstances[0] as FakeListConnection).emitState(sampleState({ name: "Apparue" }));
      expect(root.querySelector("#list-title")?.textContent).toBe("Apparue");
    });

    it("met à jour le point de connexion", async () => {
      const conn = await mount();
      const dot = root.querySelector("#conn-dot") as HTMLElement;
      expect(dot.className.trim()).toBe("conn-dot");
      expect(dot.classList.contains("online")).toBe(false);
      expect(dot.getAttribute("title")).toBe("Connexion…");

      conn.emitConnection(true);
      expect(dot.classList.contains("online")).toBe(true);
      expect(dot.getAttribute("title")).toBe("Synchronisé");

      conn.emitConnection(false);
      expect(dot.classList.contains("online")).toBe(false);
      expect(dot.getAttribute("title")).toBe("Connexion…");
    });

    it("ouvre la liste déjà synchronisée si la connexion est établie avant le premier rendu", async () => {
      fetchListState.mockResolvedValue(sampleState());
      cleanup = mountListView(root, "ABCDEF", navigate);
      (fakeConnectionInstances[0] as FakeListConnection).emitConnection(true);
      await vi.waitFor(() => expect(root.querySelector("#conn-dot")).not.toBeNull());
      expect(root.querySelector("#conn-dot")!.classList.contains("online")).toBe(true);
      expect(root.querySelector("#conn-dot")!.getAttribute("title")).toBe("Synchronisé");
    });

    it("ignore un évènement de connexion reçu après que la vue a été remplacée", async () => {
      const conn = await mount();
      root.innerHTML = "<div>autre vue</div>";
      expect(() => conn.emitConnection(true)).not.toThrow();
    });

    it("une erreur du serveur s'affiche en toast visible puis disparaît", async () => {
      const conn = await mount();
      conn.emitError("Boom");
      const toast = document.querySelector(".toast")!;
      expect(toast.textContent).toBe("Boom");
      vi.advanceTimersByTime(1);
      expect(toast.classList.contains("visible")).toBe(true);
      vi.advanceTimersByTime(3300);
      expect(document.querySelector(".toast")).toBeNull();
    });
  });

  describe("nettoyage", () => {
    it("déconnecte, libère les interactions, la pile d'annulation, les popovers et les modales", async () => {
      const conn = await mount(sampleState({ items: [makeItem({ id: "i1" })], recipients: [makeRecipient()] }));
      const disposes = dndCalls.map((c) => c.dispose);
      findConfirm(root.querySelector('[data-action="delete-item"]') as HTMLElement).opts.onConfirm();
      openMenuAction("manage-recipients");
      (root.querySelector(".item-status") as HTMLButtonElement).click();
      expect(document.querySelector(".status-picker")).not.toBeNull();

      cleanup();

      expect(conn.disconnect).toHaveBeenCalledOnce();
      expect(document.querySelector(".modal-overlay")).toBeNull();
      expect(document.querySelector(".undo-toast")).toBeNull();
      expect(document.querySelector(".status-picker")).toBeNull();
      for (const d of disposes) expect(d).toHaveBeenCalled();
    });

    it("referme aussi le popover de lien ouvert", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      (root.querySelector(".item-link") as HTMLButtonElement).click();
      expect(document.querySelector(".link-editor")).not.toBeNull();
      cleanup();
      expect(document.querySelector(".link-editor")).toBeNull();
    });
  });

  describe("en-tête", () => {
    it("le bouton accueil navigue vers /", async () => {
      await mount();
      (root.querySelector("#btn-home") as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith("/");
    });

    it("affiche le cadenas de chiffrement", async () => {
      await mount();
      const badge = root.querySelector(".lock-badge")!;
      expect(badge.getAttribute("aria-label")).toBe("Données chiffrées sur le serveur");
      expect(badge.getAttribute("title")).toBe("Données chiffrées sur le serveur");
      expect(badge.querySelector("svg")).not.toBeNull();
    });

    it("bascule l'affichage des cadeaux emballés, avec libellé et état exacts", async () => {
      await mount(sampleState({ items: [makeItem({ id: "a", checked: true }), makeItem({ id: "b", order: 1 })] }));
      const btn = () => root.querySelector("#btn-hide-checked") as HTMLElement;
      expect(names()).toHaveLength(2);
      expect(btn().getAttribute("aria-label")).toBe("Masquer les cadeaux emballés");
      expect(btn().getAttribute("aria-pressed")).toBe("false");

      btn().click();
      expect(names()).toHaveLength(1);
      expect(btn().getAttribute("aria-label")).toBe("Afficher les cadeaux emballés");
      expect(btn().getAttribute("aria-pressed")).toBe("true");

      btn().click();
      expect(names()).toHaveLength(2);
      expect(btn().getAttribute("aria-label")).toBe("Masquer les cadeaux emballés");
      expect(btn().getAttribute("aria-pressed")).toBe("false");
    });

    it("reflète une préférence « masquer » déjà active au montage", async () => {
      const { setHideCheckedPreference } = await import("../lib/hideCheckedPreference");
      setHideCheckedPreference(true);
      await mount(sampleState({ items: [makeItem({ id: "a", checked: true }), makeItem({ id: "b", order: 1 })] }));
      expect(names()).toHaveLength(1);
      expect(root.querySelector("#btn-hide-checked")!.getAttribute("aria-label")).toBe("Afficher les cadeaux emballés");
      expect(root.querySelector("#btn-hide-checked")!.getAttribute("aria-pressed")).toBe("true");
    });

    describe("recherche", () => {
      const open = async (items: Item[]) => {
        await mount(sampleState({ items }));
        (root.querySelector("#btn-search") as HTMLButtonElement).click();
        return root.querySelector("#search-input") as HTMLInputElement;
      };
      const type = (input: HTMLInputElement, value: string) => {
        input.value = value;
        input.dispatchEvent(new Event("input"));
      };

      it("ouvrir la recherche focalise le champ ; un second clic la ferme et réinitialise le filtre", async () => {
        const input = await open([makeItem({ id: "a", name: "Livre" }), makeItem({ id: "b", name: "Écharpe", order: 1 })]);
        expect((root.querySelector("#search-bar") as HTMLElement).hidden).toBe(false);
        expect(document.activeElement).toBe(input);

        type(input, "liv");
        expect(names()).toEqual(["Livre"]);

        (root.querySelector("#btn-search") as HTMLButtonElement).click();
        expect((root.querySelector("#search-bar") as HTMLElement).hidden).toBe(true);
        expect(input.value).toBe("");
        expect(names().sort()).toEqual(["Livre", "Écharpe"].sort());
      });

      it("le filtre ignore la casse et les espaces autour ; message sans résultat recadré", async () => {
        const input = await open([makeItem({ id: "a", name: "Livre" })]);
        type(input, "  LIV ");
        expect(names()).toEqual(["Livre"]);
        type(input, "  zzz ");
        expect(root.querySelector(".empty-state")!.textContent).toBe("Aucun cadeau ne correspond à « zzz ».");
      });

      it("le bouton de fermeture vide le champ et la recherche", async () => {
        const input = await open([makeItem({ id: "a", name: "Livre" }), makeItem({ id: "b", name: "Écharpe", order: 1 })]);
        type(input, "liv");
        (root.querySelector("#search-close") as HTMLButtonElement).click();
        expect(input.value).toBe("");
        expect((root.querySelector("#search-bar") as HTMLElement).hidden).toBe(true);
        expect(names()).toHaveLength(2);
      });

      it("Échap dans le champ ferme la recherche, une autre touche non", async () => {
        const input = await open([makeItem({ id: "a", name: "Livre" })]);
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
        expect((root.querySelector("#search-bar") as HTMLElement).hidden).toBe(false);
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect((root.querySelector("#search-bar") as HTMLElement).hidden).toBe(true);
      });

      it("les personnes sans cadeau correspondant disparaissent pendant la recherche", async () => {
        await mount(sampleState({ recipients: [makeRecipient({ id: "r1", name: "Mamie" })], items: [makeItem({ id: "a", name: "Livre", recipientId: "r1" })] }));
        expect(personNames()).toEqual(["Mamie"]);
        (root.querySelector("#btn-search") as HTMLButtonElement).click();
        type(root.querySelector("#search-input") as HTMLInputElement, "zzz");
        expect(personNames()).toEqual([]);
      });
    });

    describe("titre", () => {
      const startRename = async () => {
        await mount(sampleState({ name: "Noël" }));
        const title = root.querySelector("#list-title") as HTMLElement;
        title.click();
        return { title, edit: findStartEdit(title) };
      };

      it("propose le nom actuel", async () => {
        const { edit } = await startRename();
        expect(edit.opts.value).toBe("Noël");
      });

      it("un nouveau nom est envoyé, affiché tout de suite et annulable", async () => {
        const conn = await mount(sampleState({ name: "Noël" }));
        const title = root.querySelector("#list-title") as HTMLElement;
        title.click();
        title.replaceChildren(document.createElement("input"));

        findStartEdit(title).opts.onCommit("Noël 2026");

        expect(title.textContent).toBe("Noël 2026");
        expect(title.querySelector("input")).toBeNull();
        expect(conn.send).toHaveBeenCalledWith({ type: "renameList", name: "Noël 2026" });
        expect(document.querySelector(".undo-toast span")!.textContent).toBe("Liste renommée en « Noël 2026 »");

        (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
        expect(conn.send).toHaveBeenLastCalledWith({ type: "renameList", name: "Noël" });
      });

      it("un nom vide ou inchangé n'envoie rien et restaure le titre", async () => {
        const conn = await mount(sampleState({ name: "Noël" }));
        const title = root.querySelector("#list-title") as HTMLElement;
        for (const value of ["", "Noël"]) {
          title.click();
          title.replaceChildren(document.createElement("input"));
          findStartEdit(title).opts.onCommit(value);
          expect(title.textContent).toBe("Noël");
          expect(title.querySelector("input")).toBeNull();
        }
        expect(conn.send).not.toHaveBeenCalled();
        expect(document.querySelector(".undo-toast")).toBeNull();
      });

      it("une mise à jour reçue pendant l'édition du titre ne l'écrase pas", async () => {
        const conn = await mount(sampleState({ name: "Noël" }));
        const title = root.querySelector("#list-title") as HTMLElement;
        const input = document.createElement("input");
        title.replaceChildren(input);
        conn.emitState(sampleState({ name: "Autre" }));
        expect(title.querySelector("input")).toBe(input);
      });
    });

    describe("menu", () => {
      it("s'ouvre et se ferme au clic sur le bouton, se ferme au clic extérieur", async () => {
        await mount();
        const panel = root.querySelector("#menu-panel") as HTMLElement;
        expect(panel.hidden).toBe(true);
        (root.querySelector("#btn-menu") as HTMLButtonElement).click();
        expect(panel.hidden).toBe(false);
        (root.querySelector("#btn-menu") as HTMLButtonElement).click();
        expect(panel.hidden).toBe(true);
        (root.querySelector("#btn-menu") as HTMLButtonElement).click();
        document.body.click();
        expect(panel.hidden).toBe(true);
      });

      it("le thème : icône et libellé, mis à jour au clic", async () => {
        const labels: string[] = [];
        for (const theme of ["system", "light", "dark"]) {
          localStorage.setItem("dmh:theme", theme);
          cleanup?.();
          await mount();
          const btn = root.querySelector('[data-action="theme"]') as HTMLElement;
          expect(btn.querySelector("svg")).not.toBeNull();
          labels.push(btn.innerHTML.replace(/\s+/g, " "));
        }
        expect(new Set(labels).size).toBe(3);

        localStorage.setItem("dmh:theme", "system");
        cleanup?.();
        await mount();
        const btn = root.querySelector('[data-action="theme"]') as HTMLElement;
        expect(btn.textContent).toContain("Thème : Auto");
        btn.click();
        expect(btn.textContent).toContain("Thème : Clair");
      });

      it("le tri des cadeaux : manuel → alphabétique → prix, libellé mis à jour et liste retriée", async () => {
        const items = [
          makeItem({ id: "a", name: "Cravate", order: 0, price: 30 }),
          makeItem({ id: "b", name: "Album", order: 1 }),
          makeItem({ id: "c", name: "Bougie", order: 2, price: 5 }),
        ];
        await mount(sampleState({ items }));
        const sort = root.querySelector('[data-action="item-sort"]') as HTMLElement;
        expect(sort.textContent).toContain("Tri des cadeaux : Manuel");
        expect(names()).toEqual(["Cravate", "Album", "Bougie"]);

        sort.click();
        expect(sort.textContent).toContain("Tri des cadeaux : Alphabétique");
        expect(names()).toEqual(["Album", "Bougie", "Cravate"]);

        sort.click();
        expect(sort.textContent).toContain("Tri des cadeaux : Prix");
        expect(names()).toEqual(["Bougie", "Cravate", "Album"]);
      });

      it("à prix égal (ou absent), le tri par prix retombe sur l'ordre alphabétique", async () => {
        localStorage.setItem("dmh:itemSort", "price");
        const items = [
          makeItem({ id: "a", name: "Zèbre", order: 0, price: 10 }),
          makeItem({ id: "b", name: "Abeille", order: 1, price: 10 }),
          makeItem({ id: "c", name: "Yack", order: 2 }),
          makeItem({ id: "d", name: "Dauphin", order: 3 }),
        ];
        await mount(sampleState({ items }));
        expect(names()).toEqual(["Abeille", "Zèbre", "Dauphin", "Yack"]);
      });

      it("l'accessibilité ouvre sa modale", async () => {
        await mount();
        openMenuAction("accessibility");
        expect(openAccessibilityModal).toHaveBeenCalledOnce();
      });

      it("le partage transmet code, nom et trois actions", async () => {
        const state = sampleState({ name: "Noël", items: [makeItem({ id: "a" })], recipients: [makeRecipient()] });
        await mount(state);
        openMenuAction("share");
        const [code, name, actions] = openShareModal.mock.calls[0] as [string, string, { onExport: () => void; onImportFile: (f: File) => void; onCompactShare: () => void }];
        expect([code, name]).toEqual(["ABCDEF", "Noël"]);

        actions.onExport();
        expect(exportListState).toHaveBeenCalledWith(expect.objectContaining({ code: "ABCDEF", name: "Noël" }));

        actions.onCompactShare();
        const [url, listName] = openCompactShareModal.mock.calls[0] as [string, string];
        expect(listName).toBe("Noël");
        const { decodeCompactShare } = await import("../lib/compactShare");
        expect(decodeCompactShare(new URL(url).searchParams.get("import"))).toEqual({ name: "Noël", items: state.items, recipients: state.recipients });
      });

      it("l'export et le lien compact utilisent l'état le plus récent", async () => {
        const conn = await mount(sampleState({ name: "Ancien" }));
        openMenuAction("share");
        const actions = openShareModal.mock.calls[0][2] as { onExport: () => void; onCompactShare: () => void };
        conn.emitState(sampleState({ name: "Récent" }));
        actions.onExport();
        expect(exportListState).toHaveBeenCalledWith(expect.objectContaining({ name: "Récent" }));
        actions.onCompactShare();
        expect(openCompactShareModal.mock.calls[0][1]).toBe("Récent");
      });

      describe("vider les cadeaux emballés", () => {
        it("armement : libellé, désactivé sans cadeau emballé", async () => {
          await mount(sampleState({ items: [makeItem({ id: "a" })] }));
          const btn = root.querySelector('[data-action="clear-checked"]') as HTMLElement;
          const call = findConfirm(btn) as unknown as { opts: { armedText: string; isDisabled: () => boolean; labelEl: HTMLElement } };
          expect(call.opts.armedText).toBe("Confirmer : tout vider ?");
          expect(call.opts.isDisabled()).toBe(true);
          expect(call.opts.labelEl).toBe(btn.querySelector(".menu-item-label"));
        });

        it("confirmé : envoie clearChecked, ferme le menu et permet d'annuler", async () => {
          const checked = [makeItem({ id: "a", checked: true }), makeItem({ id: "b", checked: true, order: 1 })];
          const conn = await mount(sampleState({ items: [...checked, makeItem({ id: "c", order: 2 })] }));
          (root.querySelector("#btn-menu") as HTMLButtonElement).click();
          const btn = root.querySelector('[data-action="clear-checked"]') as HTMLElement;
          const call = findConfirm(btn) as unknown as { opts: { isDisabled: () => boolean; onConfirm: () => void } };
          expect(call.opts.isDisabled()).toBe(false);

          call.opts.onConfirm();

          expect(conn.send).toHaveBeenCalledWith({ type: "clearChecked" });
          expect((root.querySelector("#menu-panel") as HTMLElement).hidden).toBe(true);
          expect(document.querySelector(".undo-toast span")!.textContent).toBe("2 cadeau(x) emballé(s) vidé(s)");
          (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
          expect(conn.send).toHaveBeenLastCalledWith({ type: "restoreItems", items: checked });
        });

        it("sans cadeau emballé, la confirmation ne fait rien", async () => {
          const conn = await mount(sampleState({ items: [makeItem({ id: "a" })] }));
          findConfirm(root.querySelector('[data-action="clear-checked"]') as HTMLElement).opts.onConfirm();
          expect(conn.send).not.toHaveBeenCalled();
          expect(document.querySelector(".undo-toast")).toBeNull();
        });
      });
    });
  });

  describe("import de fichier", () => {
    const fileOf = (data: unknown) => new File([JSON.stringify(data)], "liste.json", { type: "application/json" });
    const importFile = async (file: File) => {
      openMenuAction("share");
      const actions = openShareModal.mock.calls[0][2] as { onImportFile: (f: File) => Promise<void> };
      await actions.onImportFile(file);
    };

    it("un fichier invalide affiche l'erreur dans un toast", async () => {
      await mount();
      await importFile(new File(["pas du json"], "x.json"));
      expect(document.querySelector(".toast")!.textContent).toBe("Ce fichier n'est pas un JSON valide.");
    });

    it("une erreur qui n'est pas une Error affiche un message générique", async () => {
      await mount();
      openMenuAction("share");
      const actions = openShareModal.mock.calls[0][2] as { onImportFile: (f: File) => Promise<void> };
      const broken = { text: () => Promise.reject("boom") } as unknown as File;
      await actions.onImportFile(broken);
      expect(document.querySelector(".toast")!.textContent).toBe("Import impossible.");
    });

    describe("modale", () => {
      const data = { name: "Reçue", items: [makeItem({ id: "x" })], recipients: [makeRecipient({ id: "rx" })] };
      const openModal = async () => {
        const conn = await mount();
        await importFile(fileOf(data));
        return conn;
      };

      it("résume le contenu du fichier", async () => {
        await openModal();
        expect(document.querySelector(".modal-overlay p")!.textContent).toBe("1 cadeau(x) et 1 personne(s) trouvés dans le fichier.");
      });

      it("Échap la ferme une seule fois, rend le focus et retire son écouteur ; une autre touche ne fait rien", async () => {
        await openModal();
        const release = focusReleases[0];
        keydown("a");
        expect(document.querySelector(".modal-overlay")).not.toBeNull();
        keydown("Escape");
        keydown("Escape");
        expect(document.querySelector(".modal-overlay")).toBeNull();
        expect(release).toHaveBeenCalledTimes(1);
      });

      it.each([["#import-cancel"], [".modal-close"]])("%s ferme la modale et rend le focus", async (selector) => {
        await openModal();
        (document.querySelector(selector) as HTMLElement).click();
        expect(document.querySelector(".modal-overlay")).toBeNull();
        expect(focusReleases[0]).toHaveBeenCalledOnce();
      });

      it("fusionner envoie l'import puis ferme", async () => {
        const conn = await openModal();
        (document.querySelector("#import-merge") as HTMLElement).click();
        expect(conn.send).toHaveBeenCalledWith({ type: "importState", mode: "merge", data });
        expect(document.querySelector(".modal-overlay")).toBeNull();
        expect(focusReleases[0]).toHaveBeenCalledOnce();
      });

      it("remplacer demande confirmation (texte exact) ; refusé : rien n'est envoyé, la modale reste", async () => {
        const confirmSpy = vi.fn(() => false);
        vi.stubGlobal("confirm", confirmSpy);
        const conn = await openModal();
        (document.querySelector("#import-replace") as HTMLElement).click();
        expect(confirmSpy).toHaveBeenCalledWith("Remplacer entièrement la liste actuelle par le contenu du fichier ?");
        expect(conn.send).not.toHaveBeenCalled();
        expect(document.querySelector(".modal-overlay")).not.toBeNull();

        confirmSpy.mockReturnValue(true);
        (document.querySelector("#import-replace") as HTMLElement).click();
        expect(conn.send).toHaveBeenCalledWith({ type: "importState", mode: "replace", data });
        expect(document.querySelector(".modal-overlay")).toBeNull();
        expect(focusReleases[0]).toHaveBeenCalledOnce();
      });

      it("un clic sur le fond la ferme, un clic dans la fenêtre non", async () => {
        await openModal();
        (document.querySelector(".modal") as HTMLElement).click();
        expect(document.querySelector(".modal-overlay")).not.toBeNull();
        (document.querySelector(".modal-overlay") as HTMLElement).click();
        expect(document.querySelector(".modal-overlay")).toBeNull();
      });
    });
  });

  describe("gestion des personnes", () => {
    const people = () => [makeRecipient({ id: "r1", name: "Mamie", order: 0 }), makeRecipient({ id: "r2", name: "Papi", order: 1 })];
    const openManager = async (extra: Partial<ListState> = {}) => {
      const conn = await mount(sampleState({ recipients: people(), ...extra }));
      openMenuAction("manage-recipients");
      return conn;
    };
    const modal = () => document.querySelector(".modal-overlay") as HTMLElement;

    it("liste les personnes dans l'ordre, sans texte parasite, avec teinte et état exacts", async () => {
      await openManager();
      const rows = Array.from(modal().querySelectorAll(".manage-recipient-list > li")) as HTMLElement[];
      expect(rows.map((li) => li.dataset.id)).toEqual(["r1", "r2"]);
      expect(rows.map((li) => li.querySelector(".recipient-name")!.textContent)).toEqual(["Mamie", "Papi"]);
      for (const row of rows) {
        const r = row.querySelector(".recipient-row") as HTMLElement;
        expect(r.className).toBe("recipient-row");
        expect(r.getAttribute("style")).toMatch(/^--person-hue: \d+$/);
        expect(row.querySelector(".color-swatch-toggle")!.getAttribute("aria-expanded")).toBe("false");
      }
      expect(strayText(".manage-recipient-list, .manage-recipient-list li")).toEqual([]);
    });

    it("respecte le champ « ordre » et échappe les noms", async () => {
      await openManager({ recipients: [makeRecipient({ id: "b", name: "<b>B</b>", order: 1 }), makeRecipient({ id: "a", name: "A", order: 0 })] });
      expect(Array.from(modal().querySelectorAll(".recipient-name")).map((e) => e.textContent)).toEqual(["A", "<b>B</b>"]);
      expect(modal().querySelector(".recipient-name b")).toBeNull();
    });

    it("la teinte suit la couleur choisie", async () => {
      await openManager({ recipients: [makeRecipient({ id: "r1", color: 120 })] });
      expect(modal().querySelector(".recipient-row")!.getAttribute("style")).toBe("--person-hue: 120");
    });

    it("renommer propose le nom actuel ; envoie, annulable ; ignore vide et inchangé", async () => {
      const conn = await openManager();
      const name = modal().querySelector(".recipient-name") as HTMLElement;
      name.click();
      const edit = findStartEdit(name);
      expect(edit.opts.value).toBe("Mamie");

      edit.opts.onCommit("");
      edit.opts.onCommit("Mamie");
      expect(conn.send).not.toHaveBeenCalled();

      edit.opts.onCommit("Mémé");
      expect(conn.send).toHaveBeenCalledWith({ type: "renameRecipient", id: "r1", name: "Mémé" });
      expect(document.querySelector(".undo-toast span")!.textContent).toBe("« Mamie » renommé en « Mémé »");
      (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
      expect(conn.send).toHaveBeenLastCalledWith({ type: "renameRecipient", id: "r1", name: "Mamie" });
    });

    it("la palette s'ouvre, marque la couleur courante, se referme ; choisir une teinte ou Auto envoie la couleur", async () => {
      const conn = await openManager({ recipients: [makeRecipient({ id: "r1", name: "Mamie", color: 120 }), makeRecipient({ id: "r2", name: "Papi", order: 1 })] });
      const toggle = () => modal().querySelector(".color-swatch-toggle") as HTMLButtonElement;
      expect(modal().querySelector(".color-palette")).toBeNull();

      toggle().click();
      expect(toggle().getAttribute("aria-expanded")).toBe("true");
      expect(modal().querySelectorAll(".color-palette")).toHaveLength(1);
      const swatches = Array.from(modal().querySelectorAll(".color-palette .color-swatch:not(.color-swatch-auto)"));
      expect(swatches.map((b) => [b.getAttribute("data-color"), b.getAttribute("aria-label")])).toEqual([
        ["0", "Rouge"], ["30", "Orange"], ["60", "Jaune"], ["90", "Citron vert"], ["120", "Vert"], ["150", "Émeraude"],
        ["180", "Turquoise"], ["210", "Bleu ciel"], ["240", "Bleu"], ["270", "Indigo"], ["300", "Violet"], ["330", "Rose"],
      ]);
      expect(swatches.filter((b) => b.classList.contains("selected")).map((b) => b.getAttribute("data-color"))).toEqual(["120"]);
      expect(swatches.filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
      expect(swatches.map((b) => b.getAttribute("style"))).toContain("--swatch-hue: 30");
      const auto = modal().querySelector(".color-swatch-auto")!;
      expect(auto.classList.contains("selected")).toBe(false);
      expect(auto.getAttribute("aria-pressed")).toBe("false");
      expect(auto.getAttribute("aria-label")).toBe("Couleur automatique");
      expect(strayText(".color-palette")).toEqual([]);

      toggle().click();
      expect(modal().querySelector(".color-palette")).toBeNull();

      toggle().click();
      (modal().querySelector('.color-swatch[data-color="0"]') as HTMLElement).click();
      expect(conn.send).toHaveBeenCalledWith({ type: "setRecipientColor", id: "r1", color: 0 });
      expect(modal().querySelector(".color-palette")).toBeNull();

      toggle().click();
      (modal().querySelector(".color-swatch-auto") as HTMLElement).click();
      expect(conn.send).toHaveBeenLastCalledWith({ type: "setRecipientColor", id: "r1", color: null });
    });

    it("sans couleur manuelle, « Auto » est la seule pastille marquée ; la palette cible la bonne personne", async () => {
      const conn = await openManager();
      const toggles = modal().querySelectorAll(".color-swatch-toggle");
      (toggles[1] as HTMLElement).click();
      expect(modal().querySelector(".color-swatch-auto")!.classList.contains("selected")).toBe(true);
      expect(modal().querySelector(".color-swatch-auto")!.getAttribute("aria-pressed")).toBe("true");
      expect(modal().querySelectorAll(".color-swatch.selected")).toHaveLength(1);
      expect(modal().querySelectorAll('.color-swatch[aria-pressed="true"]')).toHaveLength(1);
      expect((toggles[0] as HTMLElement).getAttribute("aria-expanded")).toBe("false");
      (modal().querySelector('.color-swatch[data-color="30"]') as HTMLElement).click();
      expect(conn.send).toHaveBeenCalledWith({ type: "setRecipientColor", id: "r2", color: 30 });
    });

    it("masquer/réafficher une personne : modale, liste, totaux et progression suivent", async () => {
      await openManager({
        items: [makeItem({ id: "a", recipientId: "r1", price: 10 }), makeItem({ id: "b", recipientId: "r2", price: 5, order: 1, status: "achete" })],
      });
      expect(root.querySelectorAll(".progress-segment")).toHaveLength(2);
      expect(personNames()).toEqual(["Mamie", "Papi"]);
      expect(root.querySelector("#totals-bar")!.textContent).toBe("Total : 15,00 €");

      const toggle = () => modal().querySelector('[data-action="toggle-hidden"][data-id="r1"]') as HTMLElement;
      expect(toggle().getAttribute("aria-pressed")).toBe("false");
      expect(toggle().getAttribute("aria-label")).toBe("Masquer « Mamie » de la liste");

      toggle().click();
      expect(toggle().getAttribute("aria-pressed")).toBe("true");
      expect(toggle().getAttribute("aria-label")).toBe("Réafficher « Mamie » dans la liste");
      expect(modal().querySelector('li[data-id="r1"] .recipient-row')!.className).toBe("recipient-row recipient-row-hidden");
      expect(personNames()).toEqual(["Papi"]);
      expect(root.querySelector("#totals-bar")!.textContent).toBe("Total : 5,00 €");
      expect(root.querySelectorAll(".progress-segment")).toHaveLength(1);

      toggle().click();
      expect(personNames()).toEqual(["Mamie", "Papi"]);
      expect(root.querySelector("#totals-bar")!.textContent).toBe("Total : 15,00 €");
    });

    it("supprimer la seconde personne : libellé de confirmation, annulation limitée à ses cadeaux", async () => {
      const conn = await openManager({ items: [makeItem({ id: "a", recipientId: "r1" }), makeItem({ id: "b", recipientId: "r2", order: 1 })] });
      const del = modal().querySelectorAll('[data-action="del"]')[1] as HTMLElement;
      const call = findConfirm(del) as unknown as { opts: { armedLabel: string; onConfirm: () => void } };
      expect(call.opts.armedLabel).toBe("Confirmer la suppression de « Papi »");

      call.opts.onConfirm();
      expect(conn.send).toHaveBeenCalledWith({ type: "deleteRecipient", id: "r2" });
      expect(document.querySelector(".undo-toast span")!.textContent).toBe("« Papi » supprimé");
      (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
      expect(conn.send).toHaveBeenLastCalledWith({ type: "restoreRecipient", recipient: people()[1], itemIds: ["b"] });
    });

    it("ajouter une personne : bloque l'envoi natif, recadre le nom, vide le champ ; ignore un nom vide", async () => {
      const conn = await openManager();
      const form = modal().querySelector("#new-recipient-form") as HTMLFormElement;
      const input = modal().querySelector("#new-recipient-name") as HTMLInputElement;

      input.value = "   ";
      const empty = new Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(empty);
      expect(empty.defaultPrevented).toBe(true);
      expect(conn.send).not.toHaveBeenCalled();

      input.value = "  Tonton  ";
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      expect(conn.send).toHaveBeenCalledWith(expect.objectContaining({ type: "addRecipient", name: "Tonton" }));
      expect(input.value).toBe("");
    });

    it("le glisser-déposer cible la liste et ses lignes, et envoie l'ordre obtenu", async () => {
      const conn = await openManager();
      const dnd = findDnd(".recipient-manage-drag-handle");
      expect(dnd.opts.containerSelector).toBe(".manage-recipient-list");
      expect(dnd.opts.itemSelector).toBe("li");
      const list = modal().querySelector(".manage-recipient-list")!;
      list.append(list.children[0]);
      dnd.opts.onDrop(list.children[0] as HTMLElement);
      expect(conn.send).toHaveBeenCalledWith({ type: "reorderRecipients", orderedIds: ["r2", "r1"] });
    });

    it("à chaque rendu, libère le glisser-déposer précédent", async () => {
      await openManager();
      const first = findDnd(".recipient-manage-drag-handle").dispose;
      (modal().querySelector(".color-swatch-toggle") as HTMLElement).click();
      expect(first).toHaveBeenCalled();
    });

    it("se redessine à chaque mise à jour reçue", async () => {
      const conn = await openManager();
      conn.emitState(sampleState({ recipients: [...people(), makeRecipient({ id: "r3", name: "Tata", order: 2 })] }));
      expect(modal().querySelectorAll(".recipient-name")).toHaveLength(3);
    });

    it("fermeture : bouton, fond (pas la fenêtre), Échap une seule fois ; libère focus, abonnement et écouteur", async () => {
      const conn = await openManager();
      const release = focusReleases[focusReleases.length - 1];
      const dnd = findDnd(".recipient-manage-drag-handle");
      const callsBefore = enableDragReorder.mock.calls.length;

      (modal().querySelector(".modal") as HTMLElement).click();
      expect(modal()).not.toBeNull();
      keydown("a");
      expect(modal()).not.toBeNull();

      keydown("Escape");
      expect(document.querySelector(".modal-overlay")).toBeNull();
      expect(release).toHaveBeenCalledOnce();
      expect(dnd.dispose).toHaveBeenCalled();

      conn.emitState(sampleState({ recipients: people() }));
      keydown("Escape");
      expect(enableDragReorder.mock.calls.length).toBe(callsBefore);
      expect(release).toHaveBeenCalledOnce();
    });

    it("le bouton fermer et le clic sur le fond ferment aussi la modale", async () => {
      await openManager();
      (modal().querySelector(".modal-close") as HTMLElement).click();
      expect(document.querySelector(".modal-overlay")).toBeNull();
      openMenuAction("manage-recipients");
      modal().click();
      expect(document.querySelector(".modal-overlay")).toBeNull();
    });
  });

  describe("ajout d'un cadeau", () => {
    it("bloque l'envoi natif, recadre le texte, vide le champ et lui rend le focus", async () => {
      const conn = await mount(sampleState({ recipients: [makeRecipient({ id: "r1", name: "Mamie" })] }));
      const input = root.querySelector("#add-input") as HTMLInputElement;
      (root.querySelector("#add-recipient") as HTMLSelectElement).value = "r1";
      input.value = "  Écharpe  ";
      input.blur();

      const event = new Event("submit", { bubbles: true, cancelable: true });
      (root.querySelector("#add-form") as HTMLFormElement).dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(conn.send).toHaveBeenCalledWith({ type: "addItem", id: expect.any(String), rawText: "Écharpe", recipientId: "r1" });
      expect(input.value).toBe("");
      expect(document.activeElement).toBe(input);
    });

    it("sans destinataire choisi, envoie recipientId null ; un texte vide n'envoie rien", async () => {
      const conn = await mount();
      const input = root.querySelector("#add-input") as HTMLInputElement;
      const submit = () => (root.querySelector("#add-form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

      input.value = "   ";
      submit();
      expect(conn.send).not.toHaveBeenCalled();

      input.value = "Livre";
      submit();
      expect(conn.send).toHaveBeenCalledWith(expect.objectContaining({ rawText: "Livre", recipientId: null }));
    });

    it("le sélecteur de personne est trié, « Sans destinataire » d'abord, et garde le choix après une mise à jour", async () => {
      const recipients = [makeRecipient({ id: "r2", name: "Papi", order: 1 }), makeRecipient({ id: "r1", name: "Mamie", order: 0 })];
      const conn = await mount(sampleState({ recipients }));
      const select = root.querySelector("#add-recipient") as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([["", "Sans destinataire"], ["r1", "Mamie"], ["r2", "Papi"]]);
      expect(Array.from(select.options).map((o) => o.getAttributeNames().sort())).toEqual([["selected", "value"], ["value"], ["value"]]);

      expect(strayText("#add-recipient")).toEqual([]);
      select.value = "r2";
      conn.emitState(sampleState({ recipients }));
      expect(select.value).toBe("r2");

      conn.emitState(sampleState({ recipients: [recipients[1]] }));
      expect(select.selectedIndex).toBe(0);
      expect(strayText("#add-recipient")).toEqual([]);
    });

    it("le raccourci « ajouter un cadeau » présélectionne la personne et focalise le champ", async () => {
      await mount(sampleState({ recipients: [makeRecipient({ id: "r1", name: "Mamie" })] }));
      const input = root.querySelector("#add-input") as HTMLInputElement;
      const scroll = vi.fn();
      input.scrollIntoView = scroll;
      const btn = root.querySelector(".recipient-add") as HTMLButtonElement;
      expect(btn.getAttribute("aria-label")).toBe("Ajouter un cadeau pour Mamie");

      btn.click();

      expect((root.querySelector("#add-recipient") as HTMLSelectElement).value).toBe("r1");
      expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
      expect(document.activeElement).toBe(input);
    });
  });

  describe("sections de personnes", () => {
    it("structure : couleur, poignée, pastille, total, compteur de cadeaux restants, aucun texte parasite", async () => {
      const recipients = [makeRecipient({ id: "r1", name: "Mamie", order: 0, color: 120 }), makeRecipient({ id: "r2", name: "Papi", order: 1 })];
      const items = [
        makeItem({ id: "a", recipientId: "r1", price: 10 }),
        makeItem({ id: "b", recipientId: "r1", checked: true, order: 1, price: 5.5 }),
        makeItem({ id: "c", recipientId: "r1", order: 2 }),
        makeItem({ id: "d", recipientId: null, order: 3 }),
      ];
      await mount(sampleState({ recipients, items }));
      // Une personne sans cadeau compte comme « complète » : elle passe après « Sans destinataire ».
      const [mamie, free, papi] = Array.from(root.querySelectorAll(".recipient-section")) as HTMLElement[];

      expect(mamie.classList.contains("has-color")).toBe(true);
      expect(mamie.getAttribute("style")).toBe("--person-hue: 120");
      expect(mamie.dataset.recipientId).toBe("r1");
      expect(mamie.querySelector(".recipient-drag-handle")!.getAttribute("aria-label")).toBe("Réordonner la personne");
      expect(mamie.querySelector(".person-dot")).not.toBeNull();
      expect(mamie.querySelector(".recipient-total")!.textContent).toBe("15,50 €");
      expect(mamie.querySelector(".recipient-count")!.textContent).toBe("2");
      expect(mamie.querySelector(".recipient-empty")).toBeNull();

      expect(papi.querySelector(".recipient-total")).toBeNull();
      expect(papi.querySelector(".recipient-empty")!.textContent).toBe("Aucun cadeau pour l'instant");
      expect(papi.querySelector(".recipient-count")!.textContent).toBe("0");

      expect(free.classList.contains("has-color")).toBe(false);
      expect(free.getAttributeNames().sort()).toEqual(["class", "data-recipient-id"]);
      expect(free.dataset.recipientId).toBe("");
      expect(free.querySelector(".person-name")!.textContent).toBe("Sans destinataire");
      expect(free.querySelector(".recipient-drag-handle")).toBeNull();
      expect(free.querySelector(".person-dot")).toBeNull();
      expect(free.querySelector(".drag-handle-spacer")).not.toBeNull();
      expect(free.querySelector(".recipient-add")!.getAttribute("aria-label")).toBe("Ajouter un cadeau pour Sans destinataire");

      expect(strayText("#recipients, .recipient-section, .item-list, .recipient-header")).toEqual([]);
    });

    it("sans personne : un seul bloc sans en-tête", async () => {
      await mount(sampleState({ items: [makeItem({ id: "a" })] }));
      expect(root.querySelector(".recipient-header")).toBeNull();
      expect(strayText("#recipients, .recipient-section")).toEqual([]);
      const section = root.querySelector(".recipient-section") as HTMLElement;
      expect(section.getAttributeNames().sort()).toEqual(["class", "data-recipient-id"]);
      expect(names()).toEqual(["Livre"]);
    });

    it("sans personne ni cadeau : message d'accueil", async () => {
      await mount(sampleState());
      expect(root.querySelector(".empty-state")!.textContent).toBe("Ta liste est vide. Ajoute un premier cadeau ci-dessus 👆");
    });

    it("une personne reste affichée sans cadeau, mais pas pendant une recherche ni si ses cadeaux sont masqués", async () => {
      const recipients = [makeRecipient({ id: "r1", name: "Mamie", order: 0 }), makeRecipient({ id: "r2", name: "Papi", order: 1 })];
      await mount(sampleState({ recipients, items: [makeItem({ id: "a", recipientId: "r1", checked: true })] }));
      expect(personNames()).toEqual(["Mamie", "Papi"]);

      (root.querySelector("#btn-hide-checked") as HTMLElement).click();
      expect(personNames()).toEqual(["Papi"]);
    });

    it("tous les cadeaux emballés et masqués : message dédié ; liste vide avec « masquer » actif : message d'accueil", async () => {
      const { setHideCheckedPreference } = await import("../lib/hideCheckedPreference");
      setHideCheckedPreference(true);
      await mount(sampleState({ items: [makeItem({ id: "a", checked: true })] }));
      expect(root.querySelector(".empty-state")!.textContent).toBe("Tous les cadeaux sont emballés (et masqués).");
      cleanup();
      await mount(sampleState({ items: [] }));
      expect(root.querySelector(".empty-state")!.textContent).toContain("Ta liste est vide");
    });

    it("les personnes suivent leur champ « ordre » ; une personne entièrement emballée passe après, « Sans destinataire » en dernier avant elle", async () => {
      const mk = (id: string, name: string, order: number) => makeRecipient({ id, name, order });
      const recipients = [mk("p", "P", 0), mk("q", "Q", 1), mk("r", "R", 2), mk("s", "S", 3), mk("t", "T", 4)];
      const items = [
        makeItem({ id: "p1", recipientId: "p", checked: true }),
        makeItem({ id: "q1", recipientId: "q", order: 1 }),
        makeItem({ id: "r1", recipientId: "r", checked: true, order: 2 }),
        makeItem({ id: "r2", recipientId: "r", order: 3 }),
        makeItem({ id: "s1", recipientId: "s", checked: true, order: 4 }),
        makeItem({ id: "t1", recipientId: "t", order: 5 }),
        makeItem({ id: "u1", recipientId: null, order: 6 }),
      ];
      await mount(sampleState({ recipients: [recipients[4], recipients[2], recipients[0], recipients[3], recipients[1]], items }));
      expect(personNames()).toEqual(["Q", "R", "T", "Sans destinataire", "P", "S"]);
    });

    it("renommer une personne depuis sa section propose son nom ; l'en-tête « Sans destinataire » n'est pas modifiable", async () => {
      const conn = await mount(sampleState({ recipients: [makeRecipient({ id: "r1", name: "Mamie" })], items: [makeItem({ id: "a", recipientId: null })] }));
      const names2 = Array.from(root.querySelectorAll(".person-name")) as HTMLElement[];
      const mamie = names2.find((n) => n.textContent === "Mamie")!;
      mamie.click();
      const edit = findStartEdit(mamie);
      expect(edit.opts.value).toBe("Mamie");

      edit.opts.onCommit("");
      edit.opts.onCommit("Mamie");
      expect(conn.send).not.toHaveBeenCalled();
      edit.opts.onCommit("Mémé");
      expect(conn.send).toHaveBeenCalledWith({ type: "renameRecipient", id: "r1", name: "Mémé" });
      expect(document.querySelector(".undo-toast span")!.textContent).toBe("« Mamie » renommé en « Mémé »");
      (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
      expect(conn.send).toHaveBeenLastCalledWith({ type: "renameRecipient", id: "r1", name: "Mamie" });

      const before = startEdit.mock.calls.length;
      names2.find((n) => n.textContent === "Sans destinataire")!.click();
      expect(startEdit.mock.calls.length).toBe(before);
    });
  });

  describe("lignes de cadeaux", () => {
    const one = (overrides: Partial<Item> = {}) => sampleState({ items: [makeItem({ id: "i1", name: "Livre", ...overrides })] });

    it("affiche statut (« Idée » par défaut), prix, nom, photo, lien et suppression avec attributs exacts", async () => {
      await mount(one());
      const row = rowOf("i1");
      expect(row.className.trim().split(/\s+/)).toEqual(["item"]);
      expect(row.getAttribute("style")).toBe("--status-color: #8d8177");

      const status = row.querySelector(".item-status")!;
      expect(status.textContent).toBe("Idée");
      expect(status.getAttribute("aria-label")).toBe("Statut : Idée (cliquer pour changer)");
      expect(status.getAttribute("aria-haspopup")).toBe("true");
      expect(status.getAttribute("aria-expanded")).toBe("false");

      const price = row.querySelector(".item-price")!;
      expect(price.textContent).toBe("€");
      expect(price.className.trim().split(/\s+/)).toEqual(["item-price", "item-price-empty"]);
      expect(price.getAttribute("title")).toBe("Ajouter un prix");

      const photo = row.querySelector(".item-photo")!;
      expect(photo.className.trim().split(/\s+/)).toEqual(["item-photo", "item-photo-empty"]);
      expect(photo.getAttribute("aria-label")).toBe("Ajouter une photo à « Livre »");
      expect(photo.querySelector("img")).toBeNull();
      expect(photo.querySelector("svg")).not.toBeNull();

      const link = row.querySelector(".item-link")!;
      expect(link.className.trim().split(/\s+/)).toEqual(["item-link", "item-link-empty"]);
      expect(link.getAttribute("aria-label")).toBe("Ajouter un lien à « Livre »");
      expect(link.getAttribute("aria-expanded")).toBe("false");

      const input = row.querySelector(".item-image-input") as HTMLInputElement;
      expect(input.getAttribute("accept")).toBe("image/png,image/jpeg,image/webp,image/gif");
      expect(input.hidden).toBe(true);
      expect(row.querySelector(".item-swipe-bg")!.getAttribute("aria-hidden")).toBe("true");
      expect(row.querySelector(".item-drag-handle")!.getAttribute("aria-label")).toBe("Déplacer");
      expect(row.querySelector('[data-action="delete-item"]')!.getAttribute("aria-label")).toBe("Supprimer");
    });

    it("reflète un cadeau complet : prix, photo, lien, emballé", async () => {
      await mount(one({ status: "emballe", checked: true, price: 12.5, hasImage: true, imageVersion: 3, link: "https://x.fr" }));
      const row = rowOf("i1");
      expect(row.className.trim().split(/\s+/)).toEqual(["item", "checked"]);
      expect(row.getAttribute("style")).toBe("--status-color: var(--favorite)");
      expect(row.querySelector(".item-status")!.textContent).toBe("Emballé");
      expect(row.querySelector(".item-price")!.textContent).toBe("12,50 €");
      expect(row.querySelector(".item-price")!.className.trim().split(/\s+/)).toEqual(["item-price"]);
      expect(row.querySelector(".item-price")!.getAttribute("title")).toBe("Modifier le prix");
      const photo = row.querySelector(".item-photo")!;
      expect(photo.className).toBe("item-photo");
      expect(photo.getAttribute("aria-label")).toBe("Voir la photo de « Livre »");
      expect(photo.querySelector("img")!.getAttribute("src")).toBe("/img/ABCDEF/i1?v=3");
      expect(photo.querySelector("img")!.getAttribute("loading")).toBe("lazy");
      const link = row.querySelector(".item-link")!;
      expect(link.className.trim().split(/\s+/)).toEqual(["item-link", "item-link-set"]);
      expect(link.getAttribute("aria-label")).toBe("Voir/modifier le lien de « Livre »");
    });

    it.each([
      ["idee", "#8d8177", "Idée"],
      ["sur", "#c96a2e", "De sûr"],
      ["achete", "#2f9e52", "Acheté"],
      ["commande", "#7c5cbf", "Commandé"],
      ["recu", "#3b6ea5", "Reçu"],
      ["a_plusieurs", "#2b8f86", "À plusieurs"],
    ] as const)("statut %s : couleur et libellé", async (status, color, label) => {
      await mount(one({ status }));
      expect(rowOf("i1").getAttribute("style")).toBe(`--status-color: ${color}`);
      expect(rowOf("i1").querySelector(".item-status")!.textContent).toBe(label);
    });

    it("échappe le nom, l'id et le lien", async () => {
      await mount(sampleState({ items: [makeItem({ id: 'a"b', name: "<b>x</b>", link: '"><i>', hasImage: true })] }));
      expect(root.querySelector(".item-name b")).toBeNull();
      expect(root.querySelector(".item-name")!.textContent).toBe("<b>x</b>");
      expect(root.querySelector(".item i")).toBeNull();
      expect((root.querySelector(".item") as HTMLElement).dataset.id).toBe('a"b');
    });

    it("le prix accepte 0 et s'arrondit à 2 décimales à l'affichage", async () => {
      await mount(sampleState({ items: [makeItem({ id: "a", price: 0 }), makeItem({ id: "b", price: 3, order: 1 })] }));
      expect(rowOf("a").querySelector(".item-price")!.textContent).toBe("0,00 €");
      expect(rowOf("b").querySelector(".item-price")!.textContent).toBe("3,00 €");
    });

    describe("statut", () => {
      const openPicker = async (overrides: Partial<Item> = {}) => {
        const conn = await mount(sampleState({ items: [makeItem({ id: "i1", ...overrides }), makeItem({ id: "i2", order: 1 })] }));
        const btn = rowOf("i1").querySelector(".item-status") as HTMLButtonElement;
        btn.click();
        return { conn, btn, panel: document.querySelector(".status-picker") as HTMLElement };
      };

      it("ouvre un menu des 7 statuts, le courant marqué, ancré sous le badge", async () => {
        const { btn, panel } = await openPicker({ status: "recu" });
        expect(panel.getAttribute("role")).toBe("menu");
        expect(btn.getAttribute("aria-expanded")).toBe("true");
        const pills = Array.from(panel.querySelectorAll(".status-pill")) as HTMLElement[];
        expect(pills.map((p) => [p.dataset.status, p.textContent, p.getAttribute("aria-pressed")])).toEqual([
          ["idee", "Idée", "false"],
          ["sur", "De sûr", "false"],
          ["achete", "Acheté", "false"],
          ["commande", "Commandé", "false"],
          ["recu", "Reçu", "true"],
          ["a_plusieurs", "À plusieurs", "false"],
          ["emballe", "Emballé", "false"],
        ]);
        expect(pills[0].getAttribute("style")).toBe("--status-color: #8d8177");
        expect(panel.style.top).toBe("4px");
        expect(panel.style.left).toBe("0px");
      });

      it("recale le menu s'il déborde à droite de l'écran", async () => {
        const conn = await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
        void conn;
        vi.stubGlobal("innerWidth", 100);
        const btn = rowOf("i1").querySelector(".item-status") as HTMLButtonElement;
        vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({ top: 0, left: 90, right: 120, bottom: 10, width: 30, height: 10, x: 90, y: 0, toJSON() {} });
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
          if (this === btn) return { top: 0, left: 90, right: 120, bottom: 10, width: 30, height: 10, x: 90, y: 0, toJSON() {} };
          return { top: 0, left: 0, right: 150, bottom: 0, width: 150, height: 0, x: 0, y: 0, toJSON() {} };
        });
        btn.click();
        // débord = 150 - 100 + 8 = 58 ; gauche = max(8, 90 - 58) = 32
        expect((document.querySelector(".status-picker") as HTMLElement).style.left).toBe("32px");
      });

      it("recale au plus à 8px du bord gauche", async () => {
        await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
        vi.stubGlobal("innerWidth", 100);
        const btn = rowOf("i1").querySelector(".item-status") as HTMLButtonElement;
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
          if (this === btn) return { top: 0, left: 10, right: 40, bottom: 10, width: 30, height: 10, x: 10, y: 0, toJSON() {} };
          return { top: 0, left: 0, right: 500, bottom: 0, width: 500, height: 0, x: 0, y: 0, toJSON() {} };
        });
        btn.click();
        expect((document.querySelector(".status-picker") as HTMLElement).style.left).toBe("8px");
      });

      it("ne recale pas un menu qui tient dans l'écran", async () => {
        await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
        vi.stubGlobal("innerWidth", 1000);
        const btn = rowOf("i1").querySelector(".item-status") as HTMLButtonElement;
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
          if (this === btn) return { top: 0, left: 20, right: 40, bottom: 10, width: 20, height: 10, x: 20, y: 0, toJSON() {} };
          return { top: 0, left: 0, right: 992, bottom: 0, width: 992, height: 0, x: 0, y: 0, toJSON() {} };
        });
        btn.click();
        expect((document.querySelector(".status-picker") as HTMLElement).style.left).toBe("20px");
      });

      it("choisir un statut l'envoie, l'applique tout de suite, referme le menu et redessine", async () => {
        const { conn, panel } = await openPicker();
        (panel.querySelector('[data-status="achete"]') as HTMLElement).click();
        expect(conn.send).toHaveBeenCalledWith({ type: "updateItem", id: "i1", status: "achete" });
        expect(rowOf("i1").querySelector(".item-status")!.textContent).toBe("Acheté");
        expect(rowOf("i1").classList.contains("checked")).toBe(false);
        expect(document.querySelector(".status-picker")).toBeNull();
      });

      it("« Emballé » coche le cadeau et fait vibrer ; les autres statuts non", async () => {
        const vibrate = vi.fn();
        vi.stubGlobal("navigator", { ...navigator, vibrate });
        const { panel } = await openPicker();
        (panel.querySelector('[data-status="achete"]') as HTMLElement).click();
        expect(vibrate).not.toHaveBeenCalled();

        (rowOf("i1").querySelector(".item-status") as HTMLButtonElement).click();
        (document.querySelector('[data-status="emballe"]') as HTMLElement).click();
        expect(vibrate).toHaveBeenCalledWith(10);
        expect(rowOf("i1").classList.contains("checked")).toBe(true);
      });

      it("« Emballé » sans API de vibration ne provoque aucune erreur", async () => {
        vi.stubGlobal("navigator", { userAgent: "test" });
        const { panel } = await openPicker();
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        (panel.querySelector('[data-status="emballe"]') as HTMLElement).click();
        expect(errors).not.toHaveBeenCalled();
        expect(rowOf("i1").classList.contains("checked")).toBe(true);
      });

      it("re-cliquer le même badge referme le menu", async () => {
        const { btn } = await openPicker();
        btn.click();
        expect(document.querySelector(".status-picker")).toBeNull();
        expect(btn.getAttribute("aria-expanded")).toBe("false");
      });

      it("ouvrir un autre badge remplace le menu", async () => {
        await openPicker();
        (rowOf("i2").querySelector(".item-status") as HTMLButtonElement).click();
        expect(document.querySelectorAll(".status-picker")).toHaveLength(1);
        expect((rowOf("i1").querySelector(".item-status") as HTMLElement).getAttribute("aria-expanded")).toBe("false");
      });

      it("un clic dehors ou Échap referme le menu ; un clic dedans non ; le clic d'ouverture ne le referme pas", async () => {
        const { panel } = await openPicker();
        document.body.click();
        expect(document.querySelector(".status-picker")).not.toBeNull();

        vi.advanceTimersByTime(1);
        panel.click();
        expect(document.querySelector(".status-picker")).not.toBeNull();
        keydown("a");
        expect(document.querySelector(".status-picker")).not.toBeNull();

        document.body.click();
        expect(document.querySelector(".status-picker")).toBeNull();

        (rowOf("i1").querySelector(".item-status") as HTMLButtonElement).click();
        vi.advanceTimersByTime(1);
        keydown("Escape");
        expect(document.querySelector(".status-picker")).toBeNull();
      });

      it("un menu fermé n'écoute plus rien", async () => {
        const { panel } = await openPicker();
        vi.advanceTimersByTime(1);
        const remove = vi.spyOn(document, "removeEventListener");
        document.body.click();
        expect(remove.mock.calls.map(([t]) => t).sort()).toEqual(["click", "keydown"]);
        expect(panel.isConnected).toBe(false);
      });


      it("une mise à jour redessinant la liste referme le menu", async () => {
        const { conn } = await openPicker();
        conn.emitState(sampleState({ items: [makeItem({ id: "i1" })] }));
        expect(document.querySelector(".status-picker")).toBeNull();
      });
    });
  });

  describe("lien d'un cadeau", () => {
    const openEditor = async (link?: string) => {
      const conn = await mount(sampleState({ items: [makeItem({ id: "i1", link }), makeItem({ id: "i2", order: 1 })] }));
      const btn = rowOf("i1").querySelector(".item-link") as HTMLButtonElement;
      btn.click();
      return { conn, btn, panel: document.querySelector(".link-editor") as HTMLElement };
    };

    it("sans lien : ouvre directement le formulaire, champ focalisé et vide", async () => {
      const { btn, panel } = await openEditor();
      expect(panel.getAttribute("role")).toBe("dialog");
      expect(btn.getAttribute("aria-expanded")).toBe("true");
      const input = panel.querySelector(".link-editor-input") as HTMLInputElement;
      expect(input.value).toBe("");
      expect(input.placeholder).toBe("https://...");
      expect(input.getAttribute("inputmode")).toBe("url");
      expect(input.type).toBe("text");
      expect(document.activeElement).toBe(input);
      expect(panel.querySelector(".link-editor-remove")).toBeNull();
      expect(panel.querySelector(".link-editor-view")).toBeNull();
      expect(panel.style.top).toBe("4px");
    });

    it("enregistrer envoie le lien recadré et referme", async () => {
      const { conn, btn, panel } = await openEditor();
      (panel.querySelector(".link-editor-input") as HTMLInputElement).value = "  https://exemple.fr/x  ";
      const event = new Event("submit", { bubbles: true, cancelable: true });
      panel.querySelector(".link-editor-form")!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(conn.send).toHaveBeenCalledWith({ type: "updateItem", id: "i1", link: "https://exemple.fr/x" });
      expect(document.querySelector(".link-editor")).toBeNull();
      expect(btn.getAttribute("aria-expanded")).toBe("false");
    });

    it("avec un lien : affiche d'abord une vue en lecture seule, ouvrable dans un nouvel onglet", async () => {
      const { panel } = await openEditor("https://exemple.fr/<x>");
      expect(panel.querySelector(".link-editor-form")).toBeNull();
      const open = panel.querySelector(".link-editor-open") as HTMLAnchorElement;
      expect(open.getAttribute("href")).toBe("https://exemple.fr/<x>");
      expect(open.target).toBe("_blank");
      expect(open.rel).toBe("noopener noreferrer");
      expect(open.querySelector("span")!.textContent).toBe("https://exemple.fr/<x>");
      expect(open.querySelector("svg")).not.toBeNull();
      expect(panel.querySelector(".link-editor-edit")!.getAttribute("aria-label")).toBe("Modifier le lien");
    });

    it("le crayon passe en mode édition (sans refermer), prérempli, avec « Supprimer le lien »", async () => {
      const { panel, conn } = await openEditor("https://exemple.fr");
      vi.advanceTimersByTime(1);
      (panel.querySelector(".link-editor-edit") as HTMLElement).click();
      expect(document.querySelector(".link-editor")).toBe(panel);
      const input = panel.querySelector(".link-editor-input") as HTMLInputElement;
      expect(input.value).toBe("https://exemple.fr");
      expect(document.activeElement).toBe(input);

      vi.advanceTimersByTime(1);
      (panel.querySelector(".link-editor-remove") as HTMLElement).click();
      expect(panel.isConnected).toBe(false);
      expect(conn.send).toHaveBeenCalledWith({ type: "updateItem", id: "i1", link: "" });
      expect(document.querySelector(".link-editor")).toBeNull();
    });

    it("re-cliquer l'icône referme ; un autre cadeau remplace l'éditeur", async () => {
      const { btn } = await openEditor();
      btn.click();
      expect(document.querySelector(".link-editor")).toBeNull();
      btn.click();
      (rowOf("i2").querySelector(".item-link") as HTMLButtonElement).click();
      expect(document.querySelectorAll(".link-editor")).toHaveLength(1);
      expect(btn.getAttribute("aria-expanded")).toBe("false");
    });

    it("un clic dehors ou Échap referme ; un clic dedans non ; le clic d'ouverture ne le referme pas", async () => {
      const { panel } = await openEditor();
      document.body.click();
      expect(document.querySelector(".link-editor")).not.toBeNull();
      vi.advanceTimersByTime(1);
      panel.click();
      keydown("a");
      expect(document.querySelector(".link-editor")).not.toBeNull();
      document.body.click();
      expect(document.querySelector(".link-editor")).toBeNull();

      (rowOf("i1").querySelector(".item-link") as HTMLButtonElement).click();
      vi.advanceTimersByTime(1);
      keydown("Escape");
      expect(document.querySelector(".link-editor")).toBeNull();
    });

    it("un éditeur fermé retire ses écouteurs", async () => {
      await openEditor();
      vi.advanceTimersByTime(1);
      const remove = vi.spyOn(document, "removeEventListener");
      document.body.click();
      expect(remove.mock.calls.map(([t]) => t).sort()).toEqual(["click", "keydown"]);
    });

    it("recale l'éditeur s'il déborde à droite, au plus à 8px du bord gauche", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      vi.stubGlobal("innerWidth", 100);
      const btn = rowOf("i1").querySelector(".item-link") as HTMLButtonElement;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        if (this === btn) return { top: 0, left: 90, right: 120, bottom: 10, width: 30, height: 10, x: 90, y: 0, toJSON() {} };
        return { top: 0, left: 0, right: 150, bottom: 0, width: 150, height: 0, x: 0, y: 0, toJSON() {} };
      });
      btn.click();
      expect((document.querySelector(".link-editor") as HTMLElement).style.left).toBe("32px");
    });

  });

  describe("actions sur un cadeau", () => {
    const two = () => [makeItem({ id: "i1", name: "Livre", order: 0 }), makeItem({ id: "i2", name: "Écharpe", order: 1, price: 20 })];

    it("supprimer le second cadeau : libellé de confirmation, annulation, et pas de doublon dans la pile", async () => {
      const conn = await mount(sampleState({ items: two() }));
      const btn = rowOf("i2").querySelector('[data-action="delete-item"]') as HTMLElement;
      const call = findConfirm(btn) as unknown as { opts: { armedLabel: string; onConfirm: () => void } };
      expect(call.opts.armedLabel).toBe("Confirmer la suppression de « Écharpe »");

      call.opts.onConfirm();
      expect(conn.send).toHaveBeenCalledWith({ type: "deleteItem", id: "i2" });
      expect(document.querySelector(".undo-toast span")!.textContent).toBe("« Écharpe » supprimé");
      (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
      expect(conn.send).toHaveBeenLastCalledWith({ type: "restoreItems", items: [two()[1]] });
    });

    it("le balayage supprime le bon cadeau, annulable", async () => {
      const conn = await mount(sampleState({ items: two() }));
      const opts = findSwipe().opts as unknown as { itemSelector: string; contentSelector: string; ignoreSelector: string; onDelete: (el: HTMLElement) => void };
      expect([opts.itemSelector, opts.contentSelector, opts.ignoreSelector]).toEqual([
        ".item",
        ".item-content",
        ".item-drag-handle, .item-status, .item-delete, .item-photo, .item-link",
      ]);
      opts.onDelete(rowOf("i2"));
      expect(conn.send).toHaveBeenCalledWith({ type: "deleteItem", id: "i2" });
      expect(document.querySelector(".undo-toast span")!.textContent).toBe("« Écharpe » supprimé");
      (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
      expect(conn.send).toHaveBeenLastCalledWith({ type: "restoreItems", items: [two()[1]] });

    });

    describe("renommer", () => {
      it("propose le nom actuel du bon cadeau ; envoie, annulable ; ignore inchangé", async () => {
        const conn = await mount(sampleState({ items: two() }));
        const el = rowOf("i2").querySelector(".item-name") as HTMLElement;
        el.click();
        const edit = findStartEdit(el);
        expect(edit.opts.value).toBe("Écharpe");

        edit.opts.onCommit("Écharpe");
        expect(conn.send).not.toHaveBeenCalled();

        edit.opts.onCommit("Écharpe en laine");
        expect(conn.send).toHaveBeenCalledWith({ type: "updateItem", id: "i2", name: "Écharpe en laine" });
        expect(document.querySelector(".undo-toast span")!.textContent).toBe("« Écharpe » renommé en « Écharpe en laine »");
        (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
        expect(conn.send).toHaveBeenLastCalledWith({ type: "updateItem", id: "i2", name: "Écharpe" });
      });

      it("un nom vide redessine la liste sans rien envoyer", async () => {
        const conn = await mount(sampleState({ items: two() }));
        const el = rowOf("i1").querySelector(".item-name") as HTMLElement;
        el.click();
        el.setAttribute("data-marker", "1");
        findStartEdit(el).opts.onCommit("");
        expect(root.querySelector(".item-name")!.hasAttribute("data-marker")).toBe(false);
        expect(conn.send).not.toHaveBeenCalled();
      });
    });

    describe("prix", () => {
      const edit = async (id: string) => {
        const conn = await mount(sampleState({ items: two() }));
        const el = rowOf(id).querySelector(".item-price") as HTMLElement;
        el.click();
        return { conn, el, edit: findStartEdit(el) };
      };

      it("propose la valeur actuelle (sans le symbole €) et un indice, vide sans prix", async () => {
        const withPrice = await edit("i2");
        expect(withPrice.edit.opts.value).toBe("20,00");
        expect(withPrice.edit.opts.placeholder).toBe("Prix en €");
        cleanup();
        const without = await edit("i1");
        expect(without.edit.opts.value).toBe("");
      });

      it("accepte la virgule ou le point, arrondit au centime, envoie et permet d'annuler", async () => {
        const { conn, edit: e } = await edit("i1");
        e.opts.onCommit("12,456");
        expect(conn.send).toHaveBeenCalledWith({ type: "updateItem", id: "i1", price: 12.46 });
        expect(document.querySelector(".undo-toast span")!.textContent).toBe("Prix de « Livre » modifié");
        (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
        expect(conn.send).toHaveBeenLastCalledWith({ type: "updateItem", id: "i1", price: null });

        e.opts.onCommit("7.5");
        expect(conn.send).toHaveBeenLastCalledWith({ type: "updateItem", id: "i1", price: 7.5 });
      });

      it("0 est un prix valide", async () => {
        const { conn, edit: e } = await edit("i1");
        e.opts.onCommit("0");
        expect(conn.send).toHaveBeenCalledWith({ type: "updateItem", id: "i1", price: 0 });
      });

      it("vider le champ efface le prix (annulation : l'ancien prix)", async () => {
        const { conn, edit: e } = await edit("i2");
        e.opts.onCommit("   ");
        expect(conn.send).toHaveBeenCalledWith({ type: "updateItem", id: "i2", price: null });
        (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
        expect(conn.send).toHaveBeenLastCalledWith({ type: "updateItem", id: "i2", price: 20 });
      });

      it("un prix inchangé n'envoie rien", async () => {
        const { conn, edit: e } = await edit("i2");
        e.opts.onCommit("20");
        expect(conn.send).not.toHaveBeenCalled();
        const none = await edit("i1");
        none.edit.opts.onCommit("");
        expect(none.conn.send).not.toHaveBeenCalled();
      });

      it.each([["abc"], ["-5"], ["NaN"], ["Infinity"]])("une saisie invalide (%s) affiche « Prix invalide. » et redessine", async (raw) => {
        const { conn, el, edit: e } = await edit("i1");
        el.setAttribute("data-marker", "1");
        e.opts.onCommit(raw);
        expect(document.querySelector(".toast")!.textContent).toBe("Prix invalide.");
        expect(conn.send).not.toHaveBeenCalled();
        expect(root.querySelector(".item-price")!.hasAttribute("data-marker")).toBe(false);
      });
    });

    describe("glisser-déposer", () => {
      const setup = async () => {
        const recipients = [makeRecipient({ id: "r1", name: "A", order: 0 }), makeRecipient({ id: "r2", name: "B", order: 1 })];
        const items = [makeItem({ id: "i1", recipientId: "r2" }), makeItem({ id: "i2", recipientId: "r1", order: 1 })];
        const conn = await mount(sampleState({ recipients, items }));
        conn.send.mockClear();
        return conn;
      };

      it("cible les listes et les lignes ; un cadeau laissé chez sa personne n'envoie que le nouvel ordre", async () => {
        const conn = await setup();
        const dnd = findDnd(".item-drag-handle");
        expect(dnd.opts.containerSelector).toBe(".item-list");
        expect(dnd.opts.itemSelector).toBe(".item");
        dnd.opts.onDrop(rowOf("i2"));
        expect(conn.send.mock.calls.map(([m]) => (m as { type: string }).type)).toEqual(["reorderItems"]);
        expect(conn.send).toHaveBeenCalledWith({ type: "reorderItems", orderedIds: ["i2", "i1"] });
      });

      it("un cadeau déposé chez une autre personne change de destinataire, puis l'ordre est envoyé", async () => {
        const conn = await setup();
        const target = root.querySelector('.item-list[data-recipient-id="r2"]')!;
        target.appendChild(rowOf("i2"));
        findDnd(".item-drag-handle").opts.onDrop(rowOf("i2"));
        expect(conn.send).toHaveBeenNthCalledWith(1, { type: "updateItem", id: "i2", recipientId: "r2" });
        expect(conn.send.mock.calls[1][0]).toEqual({ type: "reorderItems", orderedIds: expect.any(Array) });
      });

      it("déposé dans la liste « sans destinataire », le destinataire devient null", async () => {
        const conn = await setup();
        const list = document.createElement("ul");
        list.className = "item-list";
        list.setAttribute("data-recipient-id", "");
        root.querySelector("#recipients")!.appendChild(list);
        list.appendChild(rowOf("i2"));
        findDnd(".item-drag-handle").opts.onDrop(rowOf("i2"));
        expect(conn.send).toHaveBeenNthCalledWith(1, { type: "updateItem", id: "i2", recipientId: null });
      });

      it("déposé hors de toute liste, le destinataire devient null aussi", async () => {
        const conn = await setup();
        const orphan = rowOf("i2");
        root.querySelector("#recipients")!.appendChild(orphan);
        findDnd(".item-drag-handle").opts.onDrop(orphan);
        expect(conn.send).toHaveBeenNthCalledWith(1, { type: "updateItem", id: "i2", recipientId: null });
      });

      it("un cadeau inconnu n'envoie que l'ordre", async () => {
        const conn = await setup();
        const ghost = document.createElement("li");
        ghost.className = "item";
        ghost.dataset.id = "nope";
        root.querySelector(".item-list")!.appendChild(ghost);
        findDnd(".item-drag-handle").opts.onDrop(ghost);
        expect(conn.send.mock.calls.map(([m]) => (m as { type: string }).type)).toEqual(["reorderItems"]);
      });

      it("réordonner les personnes cible les sections et envoie l'ordre sans « sans destinataire »", async () => {
        const recipients = [makeRecipient({ id: "r1", name: "A", order: 0 }), makeRecipient({ id: "r2", name: "B", order: 1 })];
        const conn = await mount(sampleState({ recipients, items: [makeItem({ id: "x", recipientId: null })] }));
        const dnd = findDnd(".recipient-drag-handle");
        expect(dnd.opts.containerSelector).toBe("#recipients");
        expect(dnd.opts.itemSelector).toBe(".recipient-section");
        const container = root.querySelector("#recipients")!;
        // Sections : « sans destinataire », r1, r2 → r2 passe en tête.
        container.prepend(container.children[2]);
        conn.send.mockClear();
        dnd.opts.onDrop(container.children[0] as HTMLElement);
        expect(conn.send).toHaveBeenCalledWith({ type: "reorderRecipients", orderedIds: ["r2", "r1"] });
      });

      it("les interactions sont câblées une seule fois (pas à chaque rendu)", async () => {
        const conn = await setup();
        const calls = enableDragReorder.mock.calls.length;
        const swipes = enableSwipeToDelete.mock.calls.length;
        conn.emitState(sampleState());
        expect(enableDragReorder.mock.calls.length).toBe(calls);
        expect(enableSwipeToDelete.mock.calls.length).toBe(swipes);
      });
    });
  });

  describe("photos", () => {
    const photoBtn = (id: string) => rowOf(id).querySelector('[data-action="item-photo"]') as HTMLButtonElement;
    const input = (id: string) => rowOf(id).querySelector(".item-image-input") as HTMLInputElement;
    const choose = (id: string, file: File) => {
      Object.defineProperty(input(id), "files", { value: [file], configurable: true });
      input(id).dispatchEvent(new Event("change"));
    };
    const png = (size = 10, type = "image/png") => {
      const file = new File(["x"], "p.png", { type });
      Object.defineProperty(file, "size", { value: size });
      return file;
    };

    it("sans photo : ouvre le sélecteur de fichier du bon cadeau", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1" }), makeItem({ id: "i2", order: 1 })] }));
      const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
        this.dataset.clicked = "1";
      });
      photoBtn("i2").click();
      expect(click).toHaveBeenCalledOnce();
      expect(input("i2").dataset.clicked).toBe("1");
      expect(input("i1").dataset.clicked).toBeUndefined();
    });

    it("envoie le fichier choisi, indique le chargement puis le retire", async () => {
      let resolve!: () => void;
      uploadItemImage.mockReturnValue(new Promise<void>((r) => (resolve = r)));
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      const file = png();
      choose("i1", file);
      expect(uploadItemImage).toHaveBeenCalledWith("ABCDEF", "i1", file);
      expect(photoBtn("i1").classList.contains("is-loading")).toBe(true);
      expect(input("i1").value).toBe("");
      resolve();
      await vi.waitFor(() => expect(photoBtn("i1").classList.contains("is-loading")).toBe(false));
    });

    it("annuler la sélection n'envoie rien", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      Object.defineProperty(input("i1"), "files", { value: [], configurable: true });
      input("i1").dispatchEvent(new Event("change"));
      expect(uploadItemImage).not.toHaveBeenCalled();
    });

    it.each(["image/png", "image/jpeg", "image/webp", "image/gif"])("accepte %s", async (type) => {
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      choose("i1", png(10, type));
      expect(uploadItemImage).toHaveBeenCalledOnce();
    });

    it("refuse un format non supporté (message exact)", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      choose("i1", png(10, "image/svg+xml"));
      expect(uploadItemImage).not.toHaveBeenCalled();
      expect(document.querySelector(".toast")!.textContent).toBe("Format d'image non supporté (PNG, JPEG, WebP ou GIF).");
      expect(photoBtn("i1").classList.contains("is-loading")).toBe(false);
    });

    it("accepte 5 Mo pile, refuse un octet de plus (message exact)", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      choose("i1", png(5 * 1024 * 1024));
      expect(uploadItemImage).toHaveBeenCalledOnce();
      document.querySelector(".toast")?.remove();
      choose("i1", png(5 * 1024 * 1024 + 1));
      expect(uploadItemImage).toHaveBeenCalledOnce();
      expect(document.querySelector(".toast")!.textContent).toBe("Image trop volumineuse (5 Mo max).");
    });

    it("un échec d'envoi affiche le message du serveur, ou un message générique", async () => {
      uploadItemImage.mockRejectedValue(new Error("Trop gros"));
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      choose("i1", png());
      await vi.waitFor(() => expect(document.querySelector(".toast")?.textContent).toBe("Trop gros"));
      expect(photoBtn("i1").classList.contains("is-loading")).toBe(false);
      document.querySelector(".toast")!.remove();

      uploadItemImage.mockRejectedValue("pas une Error");
      choose("i1", png());
      await vi.waitFor(() => expect(document.querySelector(".toast")?.textContent).toBe("Erreur réseau, réessaie."));
    });

    describe("visionneuse", () => {
      const open = async () => {
        await mount(sampleState({ items: [makeItem({ id: "i1", name: "Livre", hasImage: true, imageVersion: 2 })] }));
        photoBtn("i1").click();
        return document.querySelector(".image-lightbox-overlay") as HTMLElement;
      };

      it("ouvre la photo en grand avec le nom en texte alternatif", async () => {
        const overlay = await open();
        const img = overlay.querySelector("img")!;
        expect(img.getAttribute("src")).toBe("/img/ABCDEF/i1?v=2");
        expect(img.getAttribute("alt")).toBe("Livre");
        expect(overlay.className).toBe("modal-overlay image-lightbox-overlay");
        expect(overlay.querySelector(".image-lightbox-close")!.getAttribute("aria-label")).toBe("Fermer");
        expect(overlay.querySelector(".image-lightbox-delete")!.getAttribute("aria-label")).toBe("Supprimer la photo");
      });

      it("se ferme au clic sur le fond, sur l'image, sur le bouton ; pas ailleurs", async () => {
        let overlay = await open();
        overlay.querySelector(".image-lightbox-delete")!.dispatchEvent(new Event("mouseover"));
        expect(document.querySelector(".image-lightbox-overlay")).not.toBeNull();
        overlay.click();
        expect(document.querySelector(".image-lightbox-overlay")).toBeNull();

        photoBtn("i1").click();
        overlay = document.querySelector(".image-lightbox-overlay") as HTMLElement;
        (overlay.querySelector("img") as HTMLElement).click();
        expect(document.querySelector(".image-lightbox-overlay")).toBeNull();

        photoBtn("i1").click();
        overlay = document.querySelector(".image-lightbox-overlay") as HTMLElement;
        (overlay.querySelector(".image-lightbox-close") as HTMLElement).click();
        expect(document.querySelector(".image-lightbox-overlay")).toBeNull();
      });

      it("un clic sur un autre élément de la visionneuse ne la ferme pas", async () => {
        const overlay = await open();
        const stray = document.createElement("div");
        overlay.appendChild(stray);
        stray.click();
        expect(document.querySelector(".image-lightbox-overlay")).not.toBeNull();
      });

      it("Échap la ferme une seule fois et retire son écouteur ; une autre touche non", async () => {
        await open();
        keydown("a");
        expect(document.querySelector(".image-lightbox-overlay")).not.toBeNull();
        const remove = vi.spyOn(document, "removeEventListener");
        keydown("Escape");
        expect(document.querySelector(".image-lightbox-overlay")).toBeNull();
        expect(remove.mock.calls.map(([t]) => t)).toContain("keydown");
      });

      it("supprimer : armé en deux clics, ferme, supprime la photo avec indicateur de chargement", async () => {
        let resolve!: () => void;
        deleteItemImage.mockReturnValue(new Promise<void>((r) => (resolve = r)));
        const overlay = await open();
        const del = overlay.querySelector(".image-lightbox-delete") as HTMLElement;
        const call = findConfirm(del) as unknown as { opts: { armedLabel: string; onConfirm: () => void } };
        expect(call.opts.armedLabel).toBe("Confirmer la suppression de la photo");

        call.opts.onConfirm();
        expect(document.querySelector(".image-lightbox-overlay")).toBeNull();
        expect(deleteItemImage).toHaveBeenCalledWith("ABCDEF", "i1");
        expect(photoBtn("i1").classList.contains("is-loading")).toBe(true);
        resolve();
        await vi.waitFor(() => expect(photoBtn("i1").classList.contains("is-loading")).toBe(false));
      });

      it("un échec de suppression affiche le message, ou un message générique", async () => {
        deleteItemImage.mockRejectedValue(new Error("Introuvable"));
        let overlay = await open();
        (findConfirm(overlay.querySelector(".image-lightbox-delete") as HTMLElement).opts as { onConfirm: () => void }).onConfirm();
        await vi.waitFor(() => expect(document.querySelector(".toast")?.textContent).toBe("Introuvable"));
        expect(photoBtn("i1").classList.contains("is-loading")).toBe(false);
        document.querySelector(".toast")!.remove();

        deleteItemImage.mockRejectedValue("autre");
        photoBtn("i1").click();
        overlay = document.querySelector(".image-lightbox-overlay") as HTMLElement;
        (findConfirm(overlay.querySelector(".image-lightbox-delete") as HTMLElement).opts as { onConfirm: () => void }).onConfirm();
        await vi.waitFor(() => expect(document.querySelector(".toast")?.textContent).toBe("Erreur réseau, réessaie."));
      });
    });

  });

  describe("totaux et progression", () => {
    const bar = () => root.querySelector("#totals-bar") as HTMLElement;
    const progress = () => root.querySelector("#progress-bar") as HTMLElement;

    it("le total additionne les prix, masqué tant qu'aucun prix n'est renseigné", async () => {
      const conn = await mount(sampleState({ items: [makeItem({ id: "a" })] }));
      expect(bar().hidden).toBe(true);
      conn.emitState(sampleState({ items: [makeItem({ id: "a", price: 10.25 }), makeItem({ id: "b", price: 4.5, order: 1 }), makeItem({ id: "c", order: 2 })] }));
      expect(bar().hidden).toBe(false);
      expect(bar().textContent).toBe("Total : 14,75 €");
    });

    it("un total de 0 € reste masqué", async () => {
      await mount(sampleState({ items: [makeItem({ id: "a", price: 0 })] }));
      expect(bar().hidden).toBe(true);
    });

    it("le total ignore la recherche et le masquage des emballés, mais pas les personnes masquées", async () => {
      localStorage.setItem("dmh:hiddenRecipients", JSON.stringify(["r2"]));
      localStorage.setItem("dmh:hideChecked", "1");
      const recipients = [makeRecipient({ id: "r1", name: "A", order: 0 }), makeRecipient({ id: "r2", name: "B", order: 1 })];
      await mount(
        sampleState({
          recipients,
          items: [
            makeItem({ id: "a", recipientId: "r1", price: 10, checked: true }),
            makeItem({ id: "b", recipientId: "r2", price: 100, order: 1 }),
            makeItem({ id: "c", recipientId: null, price: 1, order: 2 }),
          ],
        }),
      );
      expect(bar().textContent).toBe("Total : 11,00 €");
    });

    it("la progression répartit les statuts en segments proportionnels, ordonnés, avec libellé accessible", async () => {
      await mount(
        sampleState({
          items: [
            makeItem({ id: "a", status: "achete" }),
            makeItem({ id: "b", order: 1 }),
            makeItem({ id: "c", order: 2, status: "achete" }),
            makeItem({ id: "d", order: 3, status: "emballe", checked: true }),
          ],
        }),
      );
      expect(progress().hidden).toBe(false);
      const segs = Array.from(progress().querySelectorAll(".progress-segment")) as HTMLElement[];
      expect(segs.map((s) => s.getAttribute("style"))).toEqual([
        "width: 25.00%; background: #8d8177",
        "width: 50.00%; background: #2f9e52",
        "width: 25.00%; background: var(--favorite)",
      ]);
      expect(progress().getAttribute("aria-label")).toBe("Idée : 1, Acheté : 2, Emballé : 1");
      expect(strayText("#progress-bar")).toEqual([]);
    });

    it("la progression est masquée sans cadeau, et ignore les personnes masquées", async () => {
      const conn = await mount(sampleState());
      expect(progress().hidden).toBe(true);
      localStorage.setItem("dmh:hiddenRecipients", JSON.stringify(["r1"]));
      conn.emitState(sampleState({ recipients: [makeRecipient({ id: "r1" })], items: [makeItem({ id: "a", recipientId: "r1" })] }));
      expect(progress().hidden).toBe(true);
    });
  });

  describe("célébration", () => {
    it("emballer le dernier cadeau déclenche une célébration annoncée, visible puis retirée", async () => {
      const conn = await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      conn.emitState(sampleState({ items: [makeItem({ id: "i1", checked: true })] }));
      const toast = document.querySelector(".celebration-toast")!;
      expect(toast.getAttribute("role")).toBe("status");
      expect(toast.textContent).toBe("🎉 Tous les cadeaux sont prêts !");
      vi.advanceTimersByTime(50);
      expect(toast.classList.contains("visible")).toBe(true);
      vi.advanceTimersByTime(2600);
      expect(toast.classList.contains("visible")).toBe(false);
      vi.advanceTimersByTime(300);
      expect(document.querySelector(".celebration-toast")).toBeNull();
    });

    it("ne célèbre pas à l'ouverture, ni une liste déjà complète, ni vide, ni partiellement emballée", async () => {
      const conn = await mount(sampleState({ items: [makeItem({ id: "a", checked: true })] }));
      expect(document.querySelector(".celebration-toast")).toBeNull();
      conn.emitState(sampleState({ items: [makeItem({ id: "a", checked: true }), makeItem({ id: "b", checked: true, order: 1 })] }));
      expect(document.querySelector(".celebration-toast")).toBeNull();
      conn.emitState(sampleState({ items: [] }));
      expect(document.querySelector(".celebration-toast")).toBeNull();
    });

    it("un cadeau emballé sur deux ne célèbre pas", async () => {
      const conn = await mount(sampleState({ items: [makeItem({ id: "a" }), makeItem({ id: "b", order: 1 })] }));
      conn.emitState(sampleState({ items: [makeItem({ id: "a", checked: true }), makeItem({ id: "b", order: 1 })] }));
      expect(document.querySelector(".celebration-toast")).toBeNull();
      conn.emitState(sampleState({ items: [makeItem({ id: "a", checked: true }), makeItem({ id: "b", checked: true, order: 1 })] }));
      expect(document.querySelector(".celebration-toast")).not.toBeNull();
    });
  });

  describe("annulation (undo)", () => {
    const del = (i: number) => findConfirm(root.querySelectorAll('[data-action="delete-item"]')[i] as HTMLElement).opts.onConfirm();
    const three = () => sampleState({ items: [makeItem({ id: "i1" }), makeItem({ id: "i2", order: 1 }), makeItem({ id: "i3", order: 2 })] });

    it("la pastille est annoncée comme statut ; le compteur apparaît dès 2 annulations", async () => {
      await mount(three());
      del(0);
      const toast = document.querySelector(".undo-toast")!;
      expect(toast.getAttribute("role")).toBe("status");
      expect(toast.querySelector("button")!.textContent).toBe("Annuler");
      del(1);
      expect(document.querySelector(".undo-toast button")!.textContent).toBe("Annuler (2)");
    });

    it("annuler ne restaure que la plus récente action (pile LIFO)", async () => {
      const conn = await mount(three());
      del(0);
      del(1);
      (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
      expect(conn.send).toHaveBeenLastCalledWith({ type: "restoreItems", items: [three().items[1]] });
      expect(document.querySelector(".undo-toast button")!.textContent).toBe("Annuler");
    });

    it("une annulation expire après 5 s ; l'expiration garde les plus récentes", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1", name: "Un" }), makeItem({ id: "i2", name: "Deux", order: 1 })] }));
      del(0);
      vi.advanceTimersByTime(2000);
      del(1);
      vi.advanceTimersByTime(3000);
      expect(document.querySelector(".undo-toast button")!.textContent).toBe("Annuler");
      expect(document.querySelector(".undo-toast span")!.textContent).toBe("« Deux » supprimé");
      vi.advanceTimersByTime(2000);
      expect(document.querySelector(".undo-toast")).toBeNull();
    });

    it("l'expiration tolère un toast déjà retiré du document", async () => {
      await mount(three());
      del(0);
      document.querySelector(".undo-toast")!.remove();
      expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    });

    it("au-delà de 10 entrées, évince la plus ancienne (dont le minuteur est annulé)", async () => {
      const items = Array.from({ length: 11 }, (_, i) => makeItem({ id: `i${i}`, order: i }));
      await mount(sampleState({ items }));
      for (let i = 0; i < 11; i++) del(i);
      expect(document.querySelector(".undo-toast button")!.textContent).toBe("Annuler (10)");
      vi.advanceTimersByTime(5000);
      expect(document.querySelector(".undo-toast")).toBeNull();
    });

    it("les minuteurs d'une vue quittée n'effacent pas le toast de la suivante", async () => {
      for (const undoBeforeLeaving of [false, true]) {
        await mount(three());
        del(0);
        if (undoBeforeLeaving) (document.querySelector(".undo-toast button") as HTMLButtonElement).click();
        vi.advanceTimersByTime(3000);
        cleanup();

        await mount(three());
        del(0);
        vi.advanceTimersByTime(2500);
        expect(document.querySelector(".undo-toast")).not.toBeNull();
        cleanup();
      }
    });
  });
  describe("détails de comportement (mutation)", () => {
    const rect = (left: number, right: number, bottom = 10) => ({ top: 0, left, right, bottom, width: right - left, height: 10, x: left, y: 0, toJSON() {} });
    const mockRects = (anchor: HTMLElement, anchorRect: ReturnType<typeof rect>, panelRect: ReturnType<typeof rect>) =>
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        return this === anchor ? anchorRect : panelRect;
      });

    it("ne célèbre pas le vidage d'une liste non terminée", async () => {
      const conn = await mount(sampleState({ items: [makeItem({ id: "a" })] }));
      conn.emitState(sampleState({ items: [] }));
      expect(document.querySelector(".celebration-toast")).toBeNull();
    });

    it("un menu de statut juste à la limite de l'écran n'est pas décalé", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      vi.stubGlobal("innerWidth", 100);
      const btn = rowOf("i1").querySelector(".item-status") as HTMLButtonElement;
      mockRects(btn, rect(0, 30), rect(0, 92));
      btn.click();
      expect((document.querySelector(".status-picker") as HTMLElement).style.left).toBe("0px");
    });

    it("l'éditeur de lien : position sous l'icône, décalage seulement s'il déborde, repositionné en mode édition", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1", link: "https://x.fr" })] }));
      vi.stubGlobal("innerWidth", 1000);
      const btn = rowOf("i1").querySelector(".item-link") as HTMLButtonElement;
      const spy = mockRects(btn, rect(40, 70, 10), rect(0, 100));
      btn.click();
      const panel = document.querySelector(".link-editor") as HTMLElement;
      expect(panel.style.top).toBe("14px");
      expect(panel.style.left).toBe("40px");

      spy.mockRestore();
      mockRects(btn, rect(60, 90, 50), rect(0, 100));
      (panel.querySelector(".link-editor-edit") as HTMLElement).click();
      expect(panel.style.top).toBe("54px");
      expect(panel.style.left).toBe("60px");
    });

    it("l'éditeur de lien juste à la limite de l'écran n'est pas décalé", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      vi.stubGlobal("innerWidth", 100);
      const btn = rowOf("i1").querySelector(".item-link") as HTMLButtonElement;
      mockRects(btn, rect(0, 30), rect(0, 92));
      btn.click();
      expect((document.querySelector(".link-editor") as HTMLElement).style.left).toBe("0px");
    });

    it("l'éditeur sans lien n'a aucun texte parasite", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      (rowOf("i1").querySelector(".item-link") as HTMLButtonElement).click();
      expect(strayText(".link-editor")).toEqual([]);
    });

    it("le menu de statut n'a aucun texte parasite", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      (rowOf("i1").querySelector(".item-status") as HTMLButtonElement).click();
      expect(strayText(".status-picker")).toEqual([]);
    });

    it("ouvrir un badge de statut ferme l'éditeur de lien ouvert, et inversement", async () => {
      await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      (rowOf("i1").querySelector(".item-link") as HTMLButtonElement).click();
      vi.advanceTimersByTime(1);
      (rowOf("i1").querySelector(".item-status") as HTMLButtonElement).click();
      expect(document.querySelector(".link-editor")).toBeNull();
      expect(document.querySelector(".status-picker")).not.toBeNull();

      vi.advanceTimersByTime(1);
      (rowOf("i1").querySelector(".item-link") as HTMLButtonElement).click();
      expect(document.querySelector(".status-picker")).toBeNull();
      expect(document.querySelector(".link-editor")).not.toBeNull();
    });

    it("une mise à jour reçue referme l'éditeur de lien", async () => {
      const conn = await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      (rowOf("i1").querySelector(".item-link") as HTMLButtonElement).click();
      conn.emitState(sampleState({ items: [makeItem({ id: "i1" })] }));
      expect(document.querySelector(".link-editor")).toBeNull();
    });

    it("le statut et le lien agissent sur le second cadeau", async () => {
      const conn = await mount(sampleState({ items: [makeItem({ id: "i1", link: "https://un.fr" }), makeItem({ id: "i2", order: 1 })] }));
      (rowOf("i2").querySelector(".item-status") as HTMLButtonElement).click();
      (document.querySelector('[data-status="sur"]') as HTMLElement).click();
      expect(conn.send).toHaveBeenCalledWith({ type: "updateItem", id: "i2", status: "sur" });

      (rowOf("i2").querySelector(".item-link") as HTMLButtonElement).click();
      expect(document.querySelector(".link-editor-view")).toBeNull();
      expect((document.querySelector(".link-editor-input") as HTMLInputElement).value).toBe("");
    });

    it("tri manuel : suit le champ « ordre », cadeaux emballés toujours en dernier", async () => {
      await mount(
        sampleState({
          items: [
            makeItem({ id: "a", name: "A", order: 3, checked: true }),
            makeItem({ id: "b", name: "B", order: 2 }),
            makeItem({ id: "c", name: "C", order: 0, checked: true }),
            makeItem({ id: "d", name: "D", order: 1 }),
          ],
        }),
      );
      expect(names()).toEqual(["D", "B", "C", "A"]);
    });

    it("sans personne : les boutons et listes du bloc « sans destinataire » ont un identifiant vide", async () => {
      await mount(sampleState({ recipients: [makeRecipient()], items: [makeItem({ id: "a", recipientId: null })] }));
      expect(root.querySelector('.recipient-add[data-id=""]')).not.toBeNull();
      expect(root.querySelector('.item-list[data-recipient-id=""]')).not.toBeNull();
      expect(root.querySelector('.person-name[data-id=""]')).not.toBeNull();
    });

    it("l'indicateur de chargement d'une photo tolère un cadeau retiré entre-temps", async () => {
      let resolve!: () => void;
      uploadItemImage.mockReturnValue(new Promise<void>((r) => (resolve = r)));
      const conn = await mount(sampleState({ items: [makeItem({ id: "i1" })] }));
      const input = rowOf("i1").querySelector(".item-image-input") as HTMLInputElement;
      Object.defineProperty(input, "files", { value: [new File(["x"], "p.png", { type: "image/png" })], configurable: true });
      input.dispatchEvent(new Event("change"));
      conn.emitState(sampleState({ items: [] }));
      resolve();
      await vi.waitFor(() => expect(uploadItemImage).toHaveBeenCalled());
      await Promise.resolve();
      await Promise.resolve();
      expect(document.querySelector(".toast")).toBeNull();
    });
  });
});
