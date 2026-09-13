// Pure state-mutation logic for a gift list, extracted out of the Durable
// Object class (listRoom.ts) so it can be unit-tested without any Workers
// runtime (storage, WebSockets, ctx...).

import type { ListState, ClientMessage, Item, Recipient } from "../shared/types";
import { MAX_NAME_LENGTH, MAX_ITEMS_PER_LIST, MAX_RECIPIENTS_PER_LIST } from "../shared/types";

export function nextOrder(list: { order: number }[]): number {
  return list.reduce((max, x) => Math.max(max, x.order), -1) + 1;
}

/** A recipient id only survives if it still names a real recipient — never
 * trust one carried over from an import, since its recipient may since have
 * been deleted (or, for an import, never existed in this list). */
export function validRecipientId(state: ListState, id: string | null): string | null {
  if (id === null) return null;
  return state.recipients.some((r) => r.id === id) ? id : null;
}

/** Always either "" or an absolute http(s) URL — enforced here rather than
 * only client-side, since anyone with the list code can send a raw
 * `updateItem` over the websocket without going through the app's own form.
 * A missing scheme (e.g. "monsite.fr") is assumed to mean https, rather than
 * rejected outright. */
export function normalizeLink(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Un id importé n'est jamais recopié tel quel s'il ne ressemble pas à un id
 * généré par l'app (uid() côté client) : cet id est ensuite interpolé sans
 * échappement dans un attribut HTML (data-id, voir src/views/list.ts), donc
 * un caractère comme `"` pourrait casser l'attribut. `importState` est le
 * seul cas où l'id vient d'un fichier/message externe plutôt que d'un champ
 * de formulaire ; un id déjà bien formé traverse inchangé. */
function sanitizeId(id: string): string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : crypto.randomUUID();
}

/** A valid price is always a finite number >= 0, rounded to the cent — an
 * out-of-range value (negative, NaN, infinite) is silently ignored rather
 * than stored, since this is enforced here rather than only client-side (see
 * normalizeLink above for why). Returns undefined for an invalid input, so
 * the caller can leave the item's price untouched instead of overwriting it
 * with garbage. */
export function normalizePrice(price: number): number | undefined {
  if (!Number.isFinite(price) || price < 0) return undefined;
  return Math.round(price * 100) / 100;
}

/** Mutates `state` in place to apply one client message. */
export function applyMessage(state: ListState, msg: ClientMessage, now: number = Date.now()): void {
  switch (msg.type) {
    case "sync":
      return;

    case "renameList": {
      const name = msg.name.trim().slice(0, MAX_NAME_LENGTH);
      if (name) state.name = name;
      return;
    }

    case "addItem": {
      if (state.items.length >= MAX_ITEMS_PER_LIST) return;
      const name = msg.rawText.trim().slice(0, MAX_NAME_LENGTH);
      if (!name) return;
      const item: Item = {
        id: msg.id,
        name,
        recipientId: validRecipientId(state, msg.recipientId),
        checked: false,
        order: nextOrder(state.items),
        status: "idee",
        createdAt: now,
        updatedAt: now,
        hasImage: false,
        imageVersion: 0,
      };
      state.items.push(item);
      return;
    }

    case "updateItem": {
      const item = state.items.find((i) => i.id === msg.id);
      if (!item) return;
      if (msg.name !== undefined) item.name = msg.name.slice(0, MAX_NAME_LENGTH);
      if (msg.recipientId !== undefined) item.recipientId = validRecipientId(state, msg.recipientId);
      if (msg.status !== undefined) {
        item.status = msg.status;
        // Pas de case à cocher séparée dans une liste de cadeaux : "Emballé"
        // est le statut qui en tient lieu (tri, "vider/masquer les cadeaux
        // emballés", célébration...) — voir shared/types.ts.
        item.checked = msg.status === "emballe";
      }
      if (msg.link !== undefined) item.link = normalizeLink(msg.link);
      if (msg.price !== undefined) {
        if (msg.price === null) {
          delete item.price;
        } else {
          const normalized = normalizePrice(msg.price);
          if (normalized !== undefined) item.price = normalized;
        }
      }
      item.updatedAt = now;
      return;
    }

    case "deleteItem": {
      state.items = state.items.filter((i) => i.id !== msg.id);
      return;
    }

    case "clearChecked": {
      state.items = state.items.filter((i) => !i.checked);
      return;
    }

    case "reorderItems": {
      const order = new Map(msg.orderedIds.map((id, idx) => [id, idx]));
      for (const item of state.items) {
        const idx = order.get(item.id);
        if (idx !== undefined) item.order = idx;
      }
      return;
    }

    case "addRecipient": {
      if (state.recipients.length >= MAX_RECIPIENTS_PER_LIST) return;
      const name = msg.name.trim().slice(0, MAX_NAME_LENGTH);
      if (!name) return;
      const recipient: Recipient = { id: msg.id, name, order: nextOrder(state.recipients) };
      state.recipients.push(recipient);
      return;
    }

    case "renameRecipient": {
      const recipient = state.recipients.find((r) => r.id === msg.id);
      if (!recipient) return;
      const name = msg.name.trim().slice(0, MAX_NAME_LENGTH);
      if (name) recipient.name = name;
      return;
    }

    case "deleteRecipient": {
      state.recipients = state.recipients.filter((r) => r.id !== msg.id);
      for (const item of state.items) {
        if (item.recipientId === msg.id) item.recipientId = null;
      }
      return;
    }

    case "reorderRecipients": {
      const order = new Map(msg.orderedIds.map((id, idx) => [id, idx]));
      for (const recipient of state.recipients) {
        const idx = order.get(recipient.id);
        if (idx !== undefined) recipient.order = idx;
      }
      return;
    }

    case "setRecipientColor": {
      const recipient = state.recipients.find((r) => r.id === msg.id);
      if (!recipient) return;
      if (msg.color === null) {
        delete recipient.color;
      } else if (Number.isInteger(msg.color) && msg.color >= 0 && msg.color < 360) {
        recipient.color = msg.color;
      }
      return;
    }

    case "setItemImage": {
      const item = state.items.find((i) => i.id === msg.id);
      if (!item) return;
      item.hasImage = msg.hasImage;
      item.imageVersion += 1;
      item.updatedAt = now;
      return;
    }

    case "importState": {
      // Un fichier importé (ou un message importState forgé à la main, ce
      // format étant atteignable directement en websocket) est la seule
      // source de cadeaux/personnes qui ne passe pas par un champ de
      // formulaire validé un par un : on lui applique donc ici les mêmes
      // normalisations qu'ailleurs (id, lien, prix) plutôt que de recopier
      // l'objet tel quel.
      const sanitizeImportedRecipient = (recipient: Recipient): Recipient => ({
        ...recipient,
        id: sanitizeId(recipient.id),
        name: recipient.name.slice(0, MAX_NAME_LENGTH),
      });
      const sanitizeImportedItem = (item: Item, recipientId: string | null, order: number): Item => {
        const sanitized: Item = { ...item, id: sanitizeId(item.id), name: item.name.slice(0, MAX_NAME_LENGTH), recipientId, order };
        if (typeof sanitized.link === "string") sanitized.link = normalizeLink(sanitized.link);
        if (typeof sanitized.price === "number") {
          const price = normalizePrice(sanitized.price);
          if (price === undefined) delete sanitized.price;
          else sanitized.price = price;
        }
        return sanitized;
      };

      if (msg.mode === "replace") {
        // .slice() avant, pas après : tronquer après coup risquerait de
        // couper un destinataire référencé par un cadeau conservé, laissant
        // ce cadeau pointer vers un destinataire qui n'existe plus.
        const recipientsRaw = msg.data.recipients.slice(0, MAX_RECIPIENTS_PER_LIST);
        const recipients = recipientsRaw.map(sanitizeImportedRecipient);
        const recipientIdMap = new Map(recipientsRaw.map((r, i) => [r.id, recipients[i].id]));
        state.recipients = recipients;
        state.items = msg.data.items
          .slice(0, MAX_ITEMS_PER_LIST)
          .map((item, i) => sanitizeImportedItem(item, item.recipientId ? (recipientIdMap.get(item.recipientId) ?? null) : null, i));
        if (msg.data.name) state.name = msg.data.name.slice(0, MAX_NAME_LENGTH);
      } else {
        const existingRecipientNames = new Map(state.recipients.map((r) => [r.name.toLowerCase(), r.id]));
        const recipientIdMap = new Map<string, string | null>();
        for (const recipient of msg.data.recipients) {
          const existingId = existingRecipientNames.get(recipient.name.toLowerCase());
          if (existingId) {
            recipientIdMap.set(recipient.id, existingId);
          } else if (state.recipients.length < MAX_RECIPIENTS_PER_LIST) {
            const newRecipient = sanitizeImportedRecipient({ ...recipient, order: nextOrder(state.recipients) });
            state.recipients.push(newRecipient);
            existingRecipientNames.set(newRecipient.name.toLowerCase(), newRecipient.id);
            recipientIdMap.set(recipient.id, newRecipient.id);
          }
          // Sinon (plafond atteint, nom inconnu) : ce destinataire importé
          // est ignoré, ses cadeaux retomberont sans destinataire (recipientId null).
        }
        const existingItemKeys = new Set(state.items.map((i) => i.name.trim().toLowerCase()));
        for (const item of msg.data.items) {
          if (state.items.length >= MAX_ITEMS_PER_LIST) break;
          if (existingItemKeys.has(item.name.trim().toLowerCase())) continue;
          const mappedRecipient = item.recipientId ? (recipientIdMap.get(item.recipientId) ?? null) : null;
          state.items.push(sanitizeImportedItem(item, mappedRecipient, nextOrder(state.items)));
        }
      }
      return;
    }

    case "restoreItems": {
      const existingIds = new Set(state.items.map((i) => i.id));
      for (const item of msg.items) {
        if (!existingIds.has(item.id)) state.items.push(item);
      }
      return;
    }

    case "restoreRecipient": {
      if (!state.recipients.some((r) => r.id === msg.recipient.id)) {
        state.recipients.push(msg.recipient);
      }
      const restoredIds = new Set(msg.itemIds);
      for (const item of state.items) {
        // Only reclaims items still unassigned: if the user manually
        // reassigned one elsewhere during the undo window, that choice wins.
        if (restoredIds.has(item.id) && item.recipientId === null) item.recipientId = msg.recipient.id;
      }
      return;
    }
  }
}
