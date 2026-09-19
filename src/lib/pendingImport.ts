import type { ImportPayload } from "./importPayload";

// État volatile en mémoire, jamais persisté : transporte l'instantané décodé
// depuis un lien compact (voir compactShare.ts) au moment du chargement
// jusqu'à l'écran d'accueil, qui propose de créer une liste à partir de son
// contenu (voir home.ts), puis jusqu'à la vue liste nouvellement créée, qui
// l'applique une fois connectée (voir list.ts).
let pending: ImportPayload | null = null;

export function setPendingImport(payload: ImportPayload): void {
  pending = payload;
}

/** Lit l'instantané en attente sans le consommer — utilisé par l'accueil
 * pour décider d'afficher la proposition de création, sans empêcher la vue
 * liste de le consommer ensuite une fois la liste effectivement créée. */
export function peekPendingImport(): ImportPayload | null {
  return pending;
}

/** Lit puis efface l'instantané en attente — à n'appeler qu'une fois, au
 * montage de la vue liste nouvellement créée pour ce contenu. */
export function takePendingImport(): ImportPayload | null {
  const value = pending;
  pending = null;
  return value;
}

export function clearPendingImport(): void {
  pending = null;
}
