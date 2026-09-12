import { describe, it, expect, vi } from "vitest";
import worker from "./index";

type Env = Parameters<typeof worker.fetch>[1];
type IncomingRequest = Parameters<typeof worker.fetch>[0];
type FetchArg = string | Request;
type FakeHandler = (code: string, input: FetchArg, init?: RequestInit) => Promise<Response> | Response;

// workers-types' fetch handler expects `Request<CfProperties>` (incoming,
// with Cloudflare-specific fields like `colo`), while `req(...)`
// produces a plain outgoing `Request` — incompatible types for the same
// runtime object. This helper bridges the two for tests.
function req(url: string, init?: RequestInit): IncomingRequest {
  return new Request(url, init) as unknown as IncomingRequest;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function makeListRoomNamespace(handler: FakeHandler): Env["LIST_ROOM"] {
  const namespace = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: (input: FetchArg, init?: RequestInit) => handler(id, input, init),
    }),
    // Unused by worker/index.ts but part of the real binding's shape.
    idFromString: (id: string) => id,
    newUniqueId: () => "unique",
    jurisdiction: () => namespace,
  };
  return namespace as unknown as Env["LIST_ROOM"];
}

function pathOf(input: FetchArg): string {
  return new URL(typeof input === "string" ? input : input.url).pathname;
}

interface FakeR2Object {
  body: BodyInit;
  httpMetadata?: { contentType?: string };
}

function makeItemImages(initial: Record<string, FakeR2Object> = {}): {
  bucket: Env["ITEM_IMAGES"];
  store: Record<string, FakeR2Object>;
} {
  const store = { ...initial };
  const bucket = {
    get: async (key: string) => store[key] ?? null,
    put: async (key: string, bytes: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) => {
      store[key] = { body: bytes, httpMetadata: opts?.httpMetadata };
    },
    delete: async (key: string) => {
      delete store[key];
    },
  };
  return { bucket: bucket as unknown as Env["ITEM_IMAGES"], store };
}

function makeRateLimiter(success = true): Env["IMAGE_WRITE_RATE_LIMITER"] {
  return { limit: async () => ({ success }) } as unknown as Env["IMAGE_WRITE_RATE_LIMITER"];
}

function makeEnv(
  listRoomHandler: FakeHandler,
  opts: {
    assetsFetch?: (request: Request) => Promise<Response> | Response;
    itemImages?: Env["ITEM_IMAGES"];
    imageRateLimiter?: Env["IMAGE_WRITE_RATE_LIMITER"];
  } = {},
): Env {
  return {
    LIST_ROOM: makeListRoomNamespace(listRoomHandler),
    ASSETS: { fetch: opts.assetsFetch ?? (() => new Response("asset", { status: 200 })) },
    ITEM_IMAGES: opts.itemImages ?? makeItemImages().bucket,
    IMAGE_WRITE_RATE_LIMITER: opts.imageRateLimiter ?? makeRateLimiter(),
  } as unknown as Env;
}

function emptyListState(code: string) {
  return { code, name: "Liste de cadeaux", items: [], recipients: [], createdAt: 0, updatedAt: 0 };
}

describe("POST /api/lists (création)", () => {
  it("crée une liste et renvoie son état JSON", async () => {
    const handler: FakeHandler = (code, input) => {
      if (pathOf(input) === "/state") return new Response("not found", { status: 404 });
      if (pathOf(input) === "/init") {
        return Response.json({ ...emptyListState(code), name: "Ma liste" });
      }
      throw new Error(`unexpected path ${pathOf(input)}`);
    };
    const env = makeEnv(handler);
    const res = await worker.fetch(req("https://app.example/api/lists", { method: "POST", body: JSON.stringify({ name: "Ma liste" }) }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await readJson(res);
    expect(body.name).toBe("Ma liste");
  });

  it("tolère un corps de requête absent ou invalide", async () => {
    const handler: FakeHandler = (code, input) => {
      if (pathOf(input) === "/state") return new Response("not found", { status: 404 });
      return Response.json(emptyListState(code));
    };
    const env = makeEnv(handler);
    const res = await worker.fetch(req("https://app.example/api/lists", { method: "POST" }), env);
    expect(res.status).toBe(200);
  });

  it("régénère un code tant que le précédent est déjà pris, jusqu'à 5 essais", async () => {
    let stateChecks = 0;
    const handler: FakeHandler = (code, input) => {
      if (pathOf(input) === "/state") {
        stateChecks += 1;
        // Toujours "pris" : force la boucle de retry à aller au bout.
        return new Response("taken", { status: 200 });
      }
      return Response.json(emptyListState(code));
    };
    const env = makeEnv(handler);
    const res = await worker.fetch(req("https://app.example/api/lists", { method: "POST" }), env);
    expect(stateChecks).toBe(5);
    // Malgré 5 collisions, on appelle quand même /init avec le dernier code généré.
    expect(res.status).toBe(200);
  });

  it("s'arrête au premier code libre (404 sur /state)", async () => {
    let stateChecks = 0;
    const handler: FakeHandler = (code, input) => {
      if (pathOf(input) === "/state") {
        stateChecks += 1;
        return stateChecks === 1 ? new Response("taken", { status: 200 }) : new Response("not found", { status: 404 });
      }
      return Response.json(emptyListState(code));
    };
    const env = makeEnv(handler);
    await worker.fetch(req("https://app.example/api/lists", { method: "POST" }), env);
    expect(stateChecks).toBe(2);
  });
});

describe("GET /api/lists/:code", () => {
  it("renvoie l'état d'une liste existante", async () => {
    const handler: FakeHandler = () => Response.json({ ...emptyListState("ABCDEF"), name: "Cadeaux" });
    const env = makeEnv(handler);
    const res = await worker.fetch(req("https://app.example/api/lists/abcdef"), env);
    expect(res.status).toBe(200);
    expect((await readJson(res)).name).toBe("Cadeaux");
  });

  it("uppercase le code avant de router vers le Durable Object", async () => {
    const received: string[] = [];
    const handler: FakeHandler = (code) => {
      received.push(code);
      return Response.json(emptyListState(code));
    };
    const env = makeEnv(handler);
    await worker.fetch(req("https://app.example/api/lists/abcdef"), env);
    expect(received).toEqual(["ABCDEF"]);
  });

  it("renvoie 404 pour un code inconnu", async () => {
    const handler: FakeHandler = () => new Response("not found", { status: 404 });
    const env = makeEnv(handler);
    const res = await worker.fetch(req("https://app.example/api/lists/ZZZZZZ"), env);
    expect(res.status).toBe(404);
  });

  it("renvoie 404 pour une méthode non gérée sur ce chemin (ex: DELETE)", async () => {
    const env = makeEnv(() => {
      throw new Error("le Durable Object ne devrait pas être appelé");
    });
    const res = await worker.fetch(req("https://app.example/api/lists/abcdef", { method: "DELETE" }), env);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/lists/:code/ws", () => {
  it("transmet la requête d'origine telle quelle au Durable Object", async () => {
    // A real 101 (WebSocket upgrade) response can only be constructed by the
    // Workers runtime itself — Node's Response constructor rejects it. That
    // actual upgrade handshake is exercised by the Playwright e2e suite
    // against a live `vite dev` instance instead; this test only checks that
    // the router forwards the exact same request object untouched.
    let receivedInput: FetchArg | null = null;
    const handler: FakeHandler = (_code, input) => {
      receivedInput = input;
      return new Response(null, { status: 200 });
    };
    const env = makeEnv(handler);
    const request = req("https://app.example/api/lists/abcdef/ws", { headers: { Upgrade: "websocket" } });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(200);
    expect(receivedInput).toBe(request);
  });
});

describe("image d'un cadeau (GET/PUT/DELETE /api/lists/:code/items/:id/image)", () => {
  it("GET renvoie 404 quand aucune image n'a été envoyée", async () => {
    const env = makeEnv(() => new Response("unused"));
    const res = await worker.fetch(req("https://app.example/api/lists/abcdef/items/i1/image"), env);
    expect(res.status).toBe(404);
  });

  it("GET renvoie l'image stockée avec son content-type et un cache long", async () => {
    const { bucket } = makeItemImages({ "items/ABCDEF/i1": { body: "fake-bytes", httpMetadata: { contentType: "image/png" } } });
    const env = makeEnv(() => new Response("unused"), { itemImages: bucket });
    const res = await worker.fetch(req("https://app.example/api/lists/abcdef/items/i1/image"), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("fake-bytes");
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("GET retombe sur application/octet-stream si le content-type stocké est absent", async () => {
    const { bucket } = makeItemImages({ "items/ABCDEF/i1": { body: "x" } });
    const env = makeEnv(() => new Response("unused"), { itemImages: bucket });
    const res = await worker.fetch(req("https://app.example/api/lists/abcdef/items/i1/image"), env);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("PUT rejette une requête sans en-tête content-type", async () => {
    const env = makeEnv(() => {
      throw new Error("le Durable Object ne devrait pas être appelé");
    });
    // Sans corps : contrairement à un corps texte, le runtime ne déduit alors
    // aucun content-type par défaut, donc `headers.get("content-type")`
    // renvoie bien `null` (voir le `?? ""` dans worker/index.ts).
    const res = await worker.fetch(req("https://app.example/api/lists/abcdef/items/i1/image", { method: "PUT" }), env);
    expect(res.status).toBe(415);
  });

  it("PUT rejette un content-type non autorisé", async () => {
    const env = makeEnv(() => {
      throw new Error("le Durable Object ne devrait pas être appelé");
    });
    const res = await worker.fetch(
      req("https://app.example/api/lists/abcdef/items/i1/image", {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: "x",
      }),
      env,
    );
    expect(res.status).toBe(415);
  });

  it("PUT rejette une image trop volumineuse d'après le content-length déclaré", async () => {
    const env = makeEnv(() => {
      throw new Error("le Durable Object ne devrait pas être appelé");
    });
    const res = await worker.fetch(
      req("https://app.example/api/lists/abcdef/items/i1/image", {
        method: "PUT",
        headers: { "content-type": "image/png", "content-length": String(6 * 1024 * 1024) },
        body: "x",
      }),
      env,
    );
    expect(res.status).toBe(413);
  });

  it("PUT rejette une image trop volumineuse d'après la taille réelle (content-length mensonger)", async () => {
    const env = makeEnv(() => {
      throw new Error("le Durable Object ne devrait pas être appelé");
    });
    const bigBody = new Uint8Array(6 * 1024 * 1024);
    const res = await worker.fetch(
      req("https://app.example/api/lists/abcdef/items/i1/image", {
        method: "PUT",
        headers: { "content-type": "image/png", "content-length": "1" },
        body: bigBody,
      }),
      env,
    );
    expect(res.status).toBe(413);
  });

  it("PUT stocke l'image en R2 et applique setItemImage sur le Durable Object", async () => {
    const { bucket, store } = makeItemImages();
    const applyCalls: unknown[] = [];
    const handler: FakeHandler = async (_code, input, init) => {
      expect(pathOf(input)).toBe("/apply");
      applyCalls.push(JSON.parse(init!.body as string));
      return Response.json(emptyListState("ABCDEF"));
    };
    const env = makeEnv(handler, { itemImages: bucket });
    const res = await worker.fetch(
      req("https://app.example/api/lists/abcdef/items/i1/image", {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: "fake-bytes",
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(store["items/ABCDEF/i1"].httpMetadata?.contentType).toBe("image/png");
    expect(applyCalls).toEqual([{ type: "setItemImage", id: "i1", hasImage: true }]);
  });

  it("DELETE retire l'image de R2 et applique setItemImage(hasImage: false)", async () => {
    const { bucket, store } = makeItemImages({ "items/ABCDEF/i1": { body: "x" } });
    const applyCalls: unknown[] = [];
    const handler: FakeHandler = async (_code, input, init) => {
      applyCalls.push(JSON.parse(init!.body as string));
      return Response.json(emptyListState("ABCDEF"));
    };
    const env = makeEnv(handler, { itemImages: bucket });
    const res = await worker.fetch(req("https://app.example/api/lists/abcdef/items/i1/image", { method: "DELETE" }), env);
    expect(res.status).toBe(200);
    expect(store["items/ABCDEF/i1"]).toBeUndefined();
    expect(applyCalls).toEqual([{ type: "setItemImage", id: "i1", hasImage: false }]);
  });

  it("renvoie 405 pour une méthode non gérée sur la route image", async () => {
    const env = makeEnv(() => {
      throw new Error("le Durable Object ne devrait pas être appelé");
    });
    const res = await worker.fetch(req("https://app.example/api/lists/abcdef/items/i1/image", { method: "PATCH" }), env);
    expect(res.status).toBe(405);
  });

  it("applique le rate limiter d'écriture d'image quand une IP est présente", async () => {
    const env = makeEnv(() => new Response("unused"), { imageRateLimiter: makeRateLimiter(false) });
    const res = await worker.fetch(
      req("https://app.example/api/lists/abcdef/items/i1/image", {
        method: "PUT",
        headers: { "content-type": "image/png", "CF-Connecting-IP": "1.2.3.4" },
        body: "x",
      }),
      env,
    );
    expect(res.status).toBe(429);
  });

  it("laisse passer l'upload quand le rate limiter autorise (IP présente)", async () => {
    const { bucket } = makeItemImages();
    const handler: FakeHandler = () => Response.json(emptyListState("ABCDEF"));
    const env = makeEnv(handler, { itemImages: bucket, imageRateLimiter: makeRateLimiter(true) });
    const res = await worker.fetch(
      req("https://app.example/api/lists/abcdef/items/i1/image", {
        method: "PUT",
        headers: { "content-type": "image/png", "CF-Connecting-IP": "1.2.3.4" },
        body: "x",
      }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("saute le rate limiter en l'absence d'en-tête CF-Connecting-IP (dev local)", async () => {
    const { bucket } = makeItemImages();
    const handler: FakeHandler = () => Response.json(emptyListState("ABCDEF"));
    const env = makeEnv(handler, { itemImages: bucket, imageRateLimiter: makeRateLimiter(false) });
    const res = await worker.fetch(
      req("https://app.example/api/lists/abcdef/items/i1/image", {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: "x",
      }),
      env,
    );
    expect(res.status).toBe(200);
  });
});

describe("CORS (client cross-origine, ex: GitHub Pages)", () => {
  it("répond au préflight OPTIONS sur /api/* sans toucher le Durable Object", async () => {
    const env = makeEnv(() => {
      throw new Error("le Durable Object ne devrait pas être appelé");
    });
    const res = await worker.fetch(req("https://app.example/api/lists", { method: "OPTIONS" }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, POST, PUT, DELETE, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("content-type");
  });

  it("ajoute les en-têtes CORS aux réponses JSON de l'API", async () => {
    const handler: FakeHandler = () => Response.json(emptyListState("ABCDEF"));
    const env = makeEnv(handler);
    const res = await worker.fetch(req("https://app.example/api/lists/abcdef"), env);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("ajoute les en-têtes CORS au 404 générique de l'API", async () => {
    const env = makeEnv(() => new Response("not found", { status: 404 }));
    const res = await worker.fetch(req("https://app.example/api/nope"), env);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("routes non gérées", () => {
  it("renvoie 404 pour un chemin /api/* inconnu", async () => {
    const env = makeEnv(() => new Response("not found", { status: 404 }));
    const res = await worker.fetch(req("https://app.example/api/nope"), env);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("délègue tout le reste aux assets statiques", async () => {
    const assetsFetch = vi.fn((request: Request) => new Response(`served:${new URL(request.url).pathname}`));
    const env = makeEnv(() => new Response("unused"), { assetsFetch });
    const request = req("https://app.example/l/ABCDEF");
    const res = await worker.fetch(request, env);
    expect(assetsFetch).toHaveBeenCalledWith(request);
    expect(await res.text()).toBe("served:/l/ABCDEF");
  });
});
