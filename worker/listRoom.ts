import { DurableObject } from "cloudflare:workers";
import type { ListState, ClientMessage, ServerMessage } from "../shared/types";
import { applyMessage } from "./reducer";
import { deriveKey, encryptWithKey, decryptWithKey, type EncryptedPayload } from "./crypto";

interface Env {
  LIST_ROOM: DurableObjectNamespace<ListRoom>;
}

const STORAGE_KEY = "state";

/** Every list is stored encrypted (see worker/crypto.ts) — everything but the
 * `encrypted` marker itself is opaque ciphertext. The plain-ListState variant
 * only still matters for reading lists persisted before encryption became
 * unconditional: the next write to one of those re-persists it encrypted,
 * so this is a one-way, lazy migration with no explicit step needed. Note
 * that this only covers the list's JSON data — item photos, stored
 * separately in R2 (see worker/index.ts), are never encrypted. */
type StoredRecord = ListState | ({ encrypted: true } & EncryptedPayload);

export class ListRoom extends DurableObject<Env> {
  private listState: ListState | null = null;
  private loaded = false;
  // The list's code never changes for the lifetime of this DO instance (it
  // *is* the instance's identity, see idFromName in worker/index.ts) — the
  // derived key is cached here rather than re-hashed + re-imported on every
  // single persist(), which happens on every mutation.
  private cryptoKey: CryptoKey | null = null;

  private async getCryptoKey(): Promise<CryptoKey> {
    if (!this.cryptoKey) {
      // The code is never in the encrypted payload itself (chicken-and-egg) —
      // it's the Durable Object's own name.
      this.cryptoKey = await deriveKey(this.ctx.id.name!);
    }
    return this.cryptoKey;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const raw = (await this.ctx.storage.get<StoredRecord>(STORAGE_KEY)) ?? null;
    if (raw && "encrypted" in raw) {
      this.listState = await decryptWithKey<ListState>(await this.getCryptoKey(), raw);
    } else {
      this.listState = raw;
    }
    this.loaded = true;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    const url = new URL(request.url);

    // Routing is based on method/headers rather than pathname: the worker
    // forwards the original client request unchanged for WebSocket upgrades
    // (needed for the upgrade handshake to work), so this DO never sees a
    // predictable path.
    if (request.headers.get("Upgrade") === "websocket") {
      if (!this.listState) return new Response("not found", { status: 404 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "state", state: this.listState } satisfies ServerMessage));
      return new Response(null, { status: 101, webSocket: client });
    }

    // Chemin dédié (donc distingué par pathname, contrairement au reste de ce
    // routage) : appelé par le worker après un upload/suppression d'image en
    // R2 (voir worker/index.ts), pour rejouer le même message que si un
    // client l'avait envoyé en websocket — même validation, même
    // persistance, même diffusion (voir applyAndBroadcast).
    if (url.pathname === "/apply" && request.method === "POST") {
      if (!this.listState) return Response.json({ error: "not found" }, { status: 404 });
      let msg: ClientMessage;
      try {
        msg = await request.json<ClientMessage>();
      } catch {
        return Response.json({ error: "bad request" }, { status: 400 });
      }
      await this.applyAndBroadcast(msg);
      return Response.json(this.listState);
    }

    if (request.method === "POST") {
      if (!this.listState) {
        const body = await request.json<{ code: string; name?: string }>();
        const now = Date.now();
        this.listState = {
          code: body.code,
          name: (body.name || "Liste de cadeaux").trim() || "Liste de cadeaux",
          items: [],
          recipients: [],
          createdAt: now,
          updatedAt: now,
        };
        await this.persist();
      }
      return Response.json(this.listState);
    }

    if (!this.listState) return new Response("not found", { status: 404 });
    return Response.json(this.listState);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ensureLoaded();
    if (!this.listState || typeof message !== "string") return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    try {
      await this.applyAndBroadcast(msg);
    } catch (err) {
      ws.send(
        JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Erreur inconnue" } satisfies ServerMessage),
      );
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    try {
      ws.close();
    } catch {
      // already closed
    }
  }

  async webSocketError(_ws: WebSocket): Promise<void> {}

  private async applyAndBroadcast(msg: ClientMessage): Promise<void> {
    applyMessage(this.listState!, msg);
    await this.persist();
    this.broadcast();
  }

  private broadcast(): void {
    const payload = JSON.stringify({ type: "state", state: this.listState! } satisfies ServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // ignore dead sockets, hibernation API cleans them up
      }
    }
  }

  private async persist(): Promise<void> {
    if (!this.listState) return;
    this.listState.updatedAt = Date.now();
    const payload = await encryptWithKey(await this.getCryptoKey(), this.listState);
    await this.ctx.storage.put<StoredRecord>(STORAGE_KEY, { encrypted: true, ...payload });
  }
}
