// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCompactShareUrl, exportListState, parseImportFile } from "./importExport";
import { decodeCompactShare } from "./compactShare";
import type { ListState } from "../../shared/types";

describe("exportListState", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let captured: { href: string; download: string } | null;

  beforeEach(() => {
    document.body.innerHTML = "";
    captured = null;
    createObjectURL = vi.fn(() => "blob:mock-url");
    revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      captured = { href: this.href, download: this.download };
    });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });

  function state(overrides: Partial<ListState> = {}): ListState {
    return { code: "ABCDEF", name: "Courses", items: [], recipients: [], createdAt: 0, updatedAt: 0, ...overrides };
  }

  it("télécharge un JSON nommé par un slug du nom de la liste, puis nettoie l'URL objet", () => {
    exportListState(state({ name: "Courses d'été !" }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(captured?.href).toBe("blob:mock-url");
    expect(captured?.download).toMatch(/^courses-d-ete-\d{4}-\d{2}-\d{2}\.json$/);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("retombe sur \"liste\" si le nom ne contient aucun caractère alphanumérique", () => {
    exportListState(state({ name: "!!!" }));
    expect(captured?.download).toMatch(/^liste-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("inclut les cadeaux et personnes mais pas le code (pas un identifiant réutilisable ailleurs)", () => {
    let blobContent = "";
    createObjectURL.mockImplementation((blob: Blob) => {
      // Blob.text() est asynchrone ; on capture la référence pour l'inspecter après coup.
      blob.text().then((text) => {
        blobContent = text;
      });
      return "blob:mock-url";
    });

    exportListState(
      state({
        items: [{ id: "1", name: "Pommes", recipientId: null, checked: false, order: 0, hasImage: false, imageVersion: 0, createdAt: 0, updatedAt: 0 }],
      }),
    );

    return vi.waitFor(() => {
      const parsed = JSON.parse(blobContent);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.recipients).toEqual([]);
      expect(parsed.code).toBeUndefined();
      expect(typeof parsed.exportedAt).toBe("number");
    });
  });
  it("exporte un fichier application/json", () => {
    exportListState(state());
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json");
  });

  it("retire tous les accents du nom pour le slug, pas seulement le premier", () => {
    exportListState(state({ name: "  Crème brûlée  " }));
    expect(captured?.download).toMatch(/^creme-brulee-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("attache le lien au document pendant le clic (requis par certains navigateurs)", () => {
    let connected = false;
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      connected = this.isConnected;
    });
    exportListState(state());
    expect(connected).toBe(true);
  });
});

describe("parseImportFile", () => {
  it("parse un export valide et normalise les champs manquants", async () => {
    const file = new File([JSON.stringify({ items: [{ id: "1" }], recipients: [] })], "export.json");
    await expect(parseImportFile(file)).resolves.toEqual({ name: "", items: [{ id: "1" }], recipients: [] });
  });

  it("conserve le nom quand il est présent", async () => {
    const file = new File([JSON.stringify({ name: "Courses", items: [], recipients: [] })], "export.json");
    await expect(parseImportFile(file)).resolves.toEqual({ name: "Courses", items: [], recipients: [] });
  });

  it("lève une erreur explicite si le contenu n'est pas du JSON valide", async () => {
    const file = new File(["ceci n'est pas du JSON"], "export.json");
    await expect(parseImportFile(file)).rejects.toThrow("Ce fichier n'est pas un JSON valide.");
  });

  it("lève une erreur explicite si le JSON n'est pas un objet (ex: un nombre)", async () => {
    const file = new File(["42"], "export.json");
    await expect(parseImportFile(file)).rejects.toThrow("Ce fichier ne ressemble pas à un export de liste de cadeaux.");
  });

  it("lève une erreur explicite si le JSON est null", async () => {
    const file = new File(["null"], "export.json");
    await expect(parseImportFile(file)).rejects.toThrow("Ce fichier ne ressemble pas à un export de liste de cadeaux.");
  });

  it("lève une erreur explicite si items/recipients ne sont pas des tableaux", async () => {
    const file = new File([JSON.stringify({ items: "pas un tableau", recipients: [] })], "export.json");
    await expect(parseImportFile(file)).rejects.toThrow("Ce fichier ne ressemble pas à un export de liste de cadeaux.");
  });

});

describe("buildCompactShareUrl", () => {
  it("construit un lien vers la racine de l'app, décodable en l'instantané d'origine", () => {
    const payload = { name: "Noël", items: [], recipients: [{ id: "r1", name: "Mamie", order: 0 }] };
    const url = new URL(buildCompactShareUrl(payload));
    expect(url.origin).toBe(location.origin);
    expect(url.pathname).toBe("/");
    expect(decodeCompactShare(url.searchParams.get("import"))).toEqual(payload);
  });
});

describe("buildCompactShareUrl sous un sous-chemin de déploiement", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("pointe vers la racine de l'app, sous-chemin compris", async () => {
    vi.stubEnv("BASE_URL", "/dansmahotte/");
    vi.resetModules();
    const { buildCompactShareUrl: build } = await import("./importExport");
    const url = new URL(build({ name: "n", items: [], recipients: [] }));
    expect(url.pathname).toBe("/dansmahotte/");
  });
});
