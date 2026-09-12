import type { ListState } from "../../shared/types";
import { apiUrl } from "./syncWorker";

export async function createList(name: string): Promise<ListState> {
  const res = await fetch(apiUrl("/api/lists"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Impossible de créer la liste.");
  return res.json();
}

export async function fetchListState(code: string): Promise<ListState | null> {
  const res = await fetch(apiUrl(`/api/lists/${encodeURIComponent(code)}`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Erreur réseau.");
  return res.json();
}

function itemImagePath(code: string, itemId: string): string {
  return `/api/lists/${encodeURIComponent(code)}/items/${encodeURIComponent(itemId)}/image`;
}

/** `version` (voir Item.imageVersion) fait partie de l'URL : elle change à
 * chaque remplacement, ce qui invalide le cache navigateur sans avoir à
 * gérer d'en-têtes de cache spécifiques côté client. */
export function itemImageUrl(code: string, itemId: string, version: number): string {
  return apiUrl(`${itemImagePath(code, itemId)}?v=${version}`);
}

export async function uploadItemImage(code: string, itemId: string, file: Blob): Promise<void> {
  const res = await fetch(apiUrl(itemImagePath(code, itemId)), {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  });
  if (!res.ok) {
    const body: { error?: string } | null = await res.json().catch(() => null);
    throw new Error(body?.error || "Impossible d'envoyer l'image.");
  }
}

export async function deleteItemImage(code: string, itemId: string): Promise<void> {
  const res = await fetch(apiUrl(itemImagePath(code, itemId)), { method: "DELETE" });
  if (!res.ok) {
    const body: { error?: string } | null = await res.json().catch(() => null);
    throw new Error(body?.error || "Impossible de supprimer l'image.");
  }
}
