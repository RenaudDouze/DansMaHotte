import { ListRoom } from "./listRoom";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "../shared/types";

export { ListRoom };

interface Env {
  LIST_ROOM: DurableObjectNamespace<ListRoom>;
  ASSETS: Fetcher;
  ITEM_IMAGES: R2Bucket;
  IMAGE_WRITE_RATE_LIMITER: RateLimit;
}

// Ambiguous characters (0/O, 1/I) are excluded so codes are easy to read aloud
// or copy from a screen.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return out;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

// Autorise l'appel depuis une origine différente (client servi par GitHub
// Pages, Worker sur un domaine *.workers.dev distinct) : sans ces en-têtes,
// le navigateur bloquerait les requêtes JSON avant même qu'elles partent.
// Sans objet pour la connexion WebSocket (jamais soumise au CORS/preflight
// par les navigateurs), donc pas ajoutés sur cette route.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  // PUT/DELETE : ajoutés pour la route image (voir plus bas). Sans eux, le
  // préflight CORS autorise la requête mais le navigateur bloque ensuite la
  // vraie requête PUT/DELETE en cross-origin (échec silencieux côté fetch,
  // sans réponse HTTP à lire — d'où un simple "Erreur réseau" côté client).
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
};

async function jsonPassthrough(res: Response): Promise<Response> {
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/lists" && request.method === "POST") {
      const body = await request.json<{ name?: string }>().catch(() => ({}) as { name?: string });

      let code = generateCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const stub = env.LIST_ROOM.get(env.LIST_ROOM.idFromName(code));
        const existing = await stub.fetch("https://list.internal/state");
        if (existing.status === 404) break;
        code = generateCode();
      }

      const stub = env.LIST_ROOM.get(env.LIST_ROOM.idFromName(code));
      const res = await stub.fetch("https://list.internal/init", {
        method: "POST",
        body: JSON.stringify({ code, name: body.name }),
        headers: { "content-type": "application/json" },
      });
      return jsonPassthrough(res);
    }

    const listMatch = url.pathname.match(/^\/api\/lists\/([A-Za-z0-9]{4,10})(\/ws)?$/);
    if (listMatch) {
      const code = normalizeCode(listMatch[1]);
      const isWs = Boolean(listMatch[2]);
      const stub = env.LIST_ROOM.get(env.LIST_ROOM.idFromName(code));

      if (isWs) {
        // Forward the original request untouched: the WebSocket upgrade
        // handshake relies on headers the runtime attaches internally.
        return stub.fetch(request);
      }

      if (request.method === "GET") {
        const res = await stub.fetch("https://list.internal/state");
        return jsonPassthrough(res);
      }
    }

    const imageMatch = url.pathname.match(/^\/api\/lists\/([A-Za-z0-9]{4,10})\/items\/([A-Za-z0-9_-]{1,64})\/image$/);
    if (imageMatch) {
      const code = normalizeCode(imageMatch[1]);
      const itemId = imageMatch[2];
      // Une seule image par cadeau : un nouvel upload écrase la précédente,
      // pas besoin de suivre plusieurs clés ni de nettoyer les anciennes.
      const key = `items/${code}/${itemId}`;

      if (request.method === "GET") {
        const object = await env.ITEM_IMAGES.get(key);
        if (!object) return new Response("Not found", { status: 404, headers: CORS_HEADERS });
        return new Response(object.body, {
          headers: {
            "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
            // L'URL change de version à chaque remplacement (voir
            // imageVersion) : un cache long est donc sans risque de servir
            // une image périmée.
            "cache-control": "public, max-age=31536000, immutable",
            // Empêche le navigateur de réinterpréter le fichier au-delà du
            // content-type déclaré (déjà validé à l'upload, voir plus bas).
            "x-content-type-options": "nosniff",
            ...CORS_HEADERS,
          },
        });
      }

      const ip = request.headers.get("CF-Connecting-IP");
      if (ip) {
        const { success } = await env.IMAGE_WRITE_RATE_LIMITER.limit({ key: ip });
        if (!success) {
          return jsonError("Trop de tentatives, réessaie dans une minute.", 429);
        }
      }

      const stub = env.LIST_ROOM.get(env.LIST_ROOM.idFromName(code));

      if (request.method === "PUT") {
        const contentType = request.headers.get("content-type") ?? "";
        if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType)) {
          return jsonError("Format d'image non supporté.", 415);
        }
        // Vérifie d'abord l'en-tête (rejet rapide sans lire le corps), puis
        // la taille réelle une fois lue : l'en-tête n'est qu'une déclaration
        // du client, pas une garantie.
        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (declaredLength > MAX_IMAGE_BYTES) {
          return jsonError("Image trop volumineuse (5 Mo max).", 413);
        }
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
          return jsonError("Image trop volumineuse (5 Mo max).", 413);
        }
        await env.ITEM_IMAGES.put(key, bytes, { httpMetadata: { contentType } });
        const res = await stub.fetch("https://list.internal/apply", {
          method: "POST",
          body: JSON.stringify({ type: "setItemImage", id: itemId, hasImage: true }),
          headers: { "content-type": "application/json" },
        });
        return jsonPassthrough(res);
      }

      if (request.method === "DELETE") {
        await env.ITEM_IMAGES.delete(key);
        const res = await stub.fetch("https://list.internal/apply", {
          method: "POST",
          body: JSON.stringify({ type: "setItemImage", id: itemId, hasImage: false }),
          headers: { "content-type": "application/json" },
        });
        return jsonPassthrough(res);
      }

      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
