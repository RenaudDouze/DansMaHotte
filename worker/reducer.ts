// Pure state-mutation logic for a gift list, extracted out of the Durable
// Object class (listRoom.ts) so it can be unit-tested without any Workers
// runtime (storage, WebSockets, ctx...).

import type { ListState, ClientMessage, Item, Recipient } from "../shared/types";
import { parseFreeText } from "../shared/quantity";

export function nextOrder(list: { order: number }[]): number {
  return list.length === 0 ? 0 : Math.max(...list.map((x) => x.order)) + 1;
}

/** A recipient id only survives if it still names a real recipient — never
 * trust one carried over from an import, since its recipient may since have
 * been deleted (or, for an import, never existed in this list). */
export function validRecipientId(state: ListState, id: string | null): string | null {
  if (id === null) return null;
  return state.recipients.some((r) => r.id === id) ? id : null;
}

/** Mutates `state` in place to apply one client message. */
export function applyMessage(state: ListState, msg: ClientMessage, now: number = Date.now()): void {
  switch (msg.type) {
    case "sync":
      return;

    case "renameList": {
      const name = msg.name.trim();
      if (name) state.name = name;
      return;
    }

    case "addItem": {
      const { name, quantity } = parseFreeText(msg.rawText);
      if (!name) return;
      const item: Item = {
        id: msg.id,
        name,
        quantity,
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
      if (msg.name !== undefined) item.name = msg.name;
      if (msg.quantity !== undefined) item.quantity = msg.quantity;
      if (msg.recipientId !== undefined) item.recipientId = validRecipientId(state, msg.recipientId);
      if (msg.status !== undefined) item.status = msg.status;
      item.updatedAt = now;
      return;
    }

    case "toggleItem": {
      const item = state.items.find((i) => i.id === msg.id);
      if (!item) return;
      item.checked = msg.checked;
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
      const name = msg.name.trim();
      if (!name) return;
      const recipient: Recipient = { id: msg.id, name, order: nextOrder(state.recipients) };
      state.recipients.push(recipient);
      return;
    }

    case "renameRecipient": {
      const recipient = state.recipients.find((r) => r.id === msg.id);
      if (!recipient) return;
      const name = msg.name.trim();
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
      if (msg.mode === "replace") {
        state.items = msg.data.items;
        state.recipients = msg.data.recipients;
        if (msg.data.name) state.name = msg.data.name;
      } else {
        const existingRecipientNames = new Map(state.recipients.map((r) => [r.name.toLowerCase(), r.id]));
        const recipientIdMap = new Map<string, string | null>();
        for (const recipient of msg.data.recipients) {
          const existingId = existingRecipientNames.get(recipient.name.toLowerCase());
          if (existingId) {
            recipientIdMap.set(recipient.id, existingId);
          } else {
            const newRecipient: Recipient = { ...recipient, order: nextOrder(state.recipients) };
            state.recipients.push(newRecipient);
            existingRecipientNames.set(newRecipient.name.toLowerCase(), newRecipient.id);
            recipientIdMap.set(recipient.id, newRecipient.id);
          }
        }
        const existingItemKeys = new Set(state.items.map((i) => i.name.trim().toLowerCase()));
        for (const item of msg.data.items) {
          if (existingItemKeys.has(item.name.trim().toLowerCase())) continue;
          const mappedRecipient = item.recipientId ? (recipientIdMap.get(item.recipientId) ?? null) : null;
          state.items.push({
            ...item,
            recipientId: mappedRecipient,
            order: nextOrder(state.items),
          });
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
