// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createList, deleteItemImage, fetchListState, itemImageUrl, uploadItemImage } from "./http";
import type { ListState } from "../../shared/types";

const sampleState: ListState = {
  code: "ABCDEF",
  name: "Courses",
  items: [],
  recipients: [],
  createdAt: 0,
  updatedAt: 0,
};

describe("createList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("poste le nom et renvoie l'état de la liste créée", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(sampleState) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createList("Courses");

    expect(result).toEqual(sampleState);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lists",
      expect.objectContaining({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Courses" }) }),
    );
  });

  it("lève une erreur si la réponse n'est pas ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(createList("Courses")).rejects.toThrow("Impossible de créer la liste.");
  });
});

describe("fetchListState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renvoie l'état de la liste pour un code existant", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(sampleState) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchListState("ABCDEF");

    expect(result).toEqual(sampleState);
    expect(fetchMock).toHaveBeenCalledWith("/api/lists/ABCDEF");
  });

  it("encode le code dans l'URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(sampleState) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchListState("A B/C");

    expect(fetchMock).toHaveBeenCalledWith("/api/lists/A%20B%2FC");
  });

  it("renvoie null pour un code inconnu (404)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchListState("ZZZZZZ")).resolves.toBeNull();
  });

  it("lève une erreur réseau pour toute autre réponse non ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchListState("ABCDEF")).rejects.toThrow("Erreur réseau.");
  });
});

describe("itemImageUrl", () => {
  it("inclut la version dans la query string (invalide le cache à chaque remplacement)", () => {
    expect(itemImageUrl("ABCDEF", "item1", 3)).toBe("/api/lists/ABCDEF/items/item1/image?v=3");
  });

  it("encode le code et l'id", () => {
    expect(itemImageUrl("A B", "i/d", 0)).toBe("/api/lists/A%20B/items/i%2Fd/image?v=0");
  });
});

describe("uploadItemImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envoie le fichier en PUT avec son content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const file = new Blob(["x"], { type: "image/png" });

    await uploadItemImage("ABCDEF", "item1", file);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lists/ABCDEF/items/item1/image",
      expect.objectContaining({ method: "PUT", headers: { "content-type": "image/png" }, body: file }),
    );
  });

  it("remonte le message d'erreur du serveur", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "Trop gros" }) }));
    await expect(uploadItemImage("A", "i", new Blob(["x"]))).rejects.toThrow("Trop gros");
  });

  it("retombe sur un message générique si la réponse n'a pas de message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
    await expect(uploadItemImage("A", "i", new Blob(["x"]))).rejects.toThrow("Impossible d'envoyer l'image.");
  });

  it("retombe sur un message générique si la réponse n'est pas du JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.reject(new Error("pas du json")) }));
    await expect(uploadItemImage("A", "i", new Blob(["x"]))).rejects.toThrow("Impossible d'envoyer l'image.");
  });
});

describe("deleteItemImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envoie un DELETE sur l'image", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await deleteItemImage("ABCDEF", "item1");

    expect(fetchMock).toHaveBeenCalledWith("/api/lists/ABCDEF/items/item1/image", { method: "DELETE" });
  });

  it("remonte le message d'erreur du serveur", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "Introuvable" }) }));
    await expect(deleteItemImage("A", "i")).rejects.toThrow("Introuvable");
  });

  it("retombe sur un message générique sans message exploitable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
    await expect(deleteItemImage("A", "i")).rejects.toThrow("Impossible de supprimer l'image.");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.reject(new Error("x")) }));
    await expect(deleteItemImage("A", "i")).rejects.toThrow("Impossible de supprimer l'image.");
  });
});
