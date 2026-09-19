import type { ListState } from "../../shared/types";
import { parseImportPayload, type ImportPayload } from "./importPayload";
import { encodeCompactShare } from "./compactShare";
import { appPath } from "./basePath";

export type { ImportPayload };

export function exportListState(state: ListState): void {
  const payload: ImportPayload & { exportedAt: number } = {
    name: state.name,
    recipients: state.recipients,
    items: state.items,
    exportedAt: Date.now(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const slug =
    state.name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "liste";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function parseImportFile(file: File): Promise<ImportPayload> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas un JSON valide.");
  }
  try {
    return parseImportPayload(data);
  } catch {
    throw new Error("Ce fichier ne ressemble pas à un export de liste de cadeaux.");
  }
}

/** Construit un lien contenant un instantané figé de la liste (nom, cadeaux,
 * personnes), sans passer par le serveur : ouvrir ce lien propose de créer
 * une toute nouvelle liste à partir de son contenu (voir home.ts), plutôt
 * que de donner accès à la liste en direct comme le lien de partage habituel
 * (voir shareModal.ts). Toujours vers la racine de l'app (appPath("/")), pas
 * vers /l/CODE : le code de la liste d'origine n'a aucun sens pour la
 * personne qui reçoit ce lien. */
export function buildCompactShareUrl(payload: ImportPayload): string {
  const url = new URL(appPath("/"), location.origin);
  url.searchParams.set("import", encodeCompactShare(payload));
  return url.toString();
}
