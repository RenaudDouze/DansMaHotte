// Types shared between the worker (Durable Object) and the client app.

export interface Recipient {
  id: string;
  name: string;
  order: number;
  /** Hue (0-359) chosen by the user, from a curated palette (see
   * src/views/list.ts's colorPaletteHtml). Unset = automatic, deterministic
   * hue derived from the recipient id (see src/lib/color.ts). */
  color?: number;
}

/** Où en est un cadeau, de l'idée jusqu'à son emballage. "À plusieurs" n'est
 * pas une étape du parcours mais un statut à part : le cadeau est pris en
 * commun avec quelqu'un d'autre. */
export type GiftStatus = "idee" | "achete" | "commande" | "recu" | "a_plusieurs" | "emballe";

export const GIFT_STATUSES: readonly GiftStatus[] = ["idee", "achete", "commande", "recu", "a_plusieurs", "emballe"];

export const GIFT_STATUS_LABELS: Record<GiftStatus, string> = {
  idee: "Idée",
  achete: "Acheté",
  commande: "Commandé",
  recu: "Reçu",
  a_plusieurs: "À plusieurs",
  emballe: "Emballé",
};

/** Taille max d'une image jointe à un cadeau (photo ou capture d'écran). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Types d'image acceptés en upload — voir worker/index.ts. Pas de SVG : un
 * SVG peut embarquer du script, un risque inutile pour une simple photo. */
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export interface Item {
  id: string;
  /** Item name with any leading/trailing quantity already stripped out. */
  name: string;
  /** Free-form quantity label, e.g. "2", "x3". Empty string = none. */
  quantity: string;
  recipientId: string | null;
  checked: boolean;
  order: number;
  /** Optional for backward compatibility with items created before this
   * field existed — always read via `item.status ?? "idee"`. */
  status?: GiftStatus;
  /** Lien vers une page web (ex: la fiche produit repérée en ligne).
   * Toujours soit vide, soit une URL absolue http(s) — voir la
   * normalisation dans worker/reducer.ts, qui s'applique même à un message
   * envoyé directement en websocket sans passer par le formulaire du
   * client. Optionnel pour les mêmes raisons que `status` ci-dessus. */
  link?: string;
  createdAt: number;
  updatedAt: number;
  /** Image jointe (photo ou capture d'écran) — voir
   * /api/lists/:code/items/:id/image. imageVersion s'incrémente à chaque
   * remplacement, pour que l'URL de l'image (qui l'inclut en query string)
   * change et invalide le cache navigateur plutôt que de réafficher
   * l'ancienne image. */
  hasImage: boolean;
  imageVersion: number;
}

export interface ListState {
  code: string;
  name: string;
  items: Item[];
  recipients: Recipient[];
  createdAt: number;
  updatedAt: number;
}

export type ClientMessage =
  | { type: "sync" }
  | { type: "renameList"; name: string }
  | { type: "addItem"; id: string; rawText: string; recipientId: string | null }
  | { type: "updateItem"; id: string; name?: string; quantity?: string; recipientId?: string | null; status?: GiftStatus; link?: string }
  | { type: "toggleItem"; id: string; checked: boolean }
  | { type: "deleteItem"; id: string }
  | { type: "clearChecked" }
  | { type: "reorderItems"; orderedIds: string[] }
  | { type: "addRecipient"; id: string; name: string }
  | { type: "renameRecipient"; id: string; name: string }
  | { type: "deleteRecipient"; id: string }
  | { type: "reorderRecipients"; orderedIds: string[] }
  | { type: "setRecipientColor"; id: string; color: number | null }
  // Émis par le worker (pas directement par un client) une fois l'upload ou
  // la suppression de l'image effectivement passée en R2 — voir
  // worker/index.ts.
  | { type: "setItemImage"; id: string; hasImage: boolean }
  | { type: "importState"; mode: "merge" | "replace"; data: Pick<ListState, "items" | "recipients" | "name"> }
  // Compensating actions for the client-side undo stack (see src/views/list.ts):
  // re-insert exactly what a previous deleteItem/clearChecked/deleteRecipient
  // removed, rather than re-deriving it (which would lose the original
  // id/order/checked state).
  | { type: "restoreItems"; items: Item[] }
  | { type: "restoreRecipient"; recipient: Recipient; itemIds: string[] };

export type ServerMessage =
  | { type: "state"; state: ListState }
  /** Ephemeral, never persisted: the display names of every WebSocket
   * currently connected to this list (see worker/listRoom.ts). */
  | { type: "presence"; names: string[] }
  | { type: "error"; message: string };
