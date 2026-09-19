import type { ListState } from "../../shared/types";

export type ImportPayload = Pick<ListState, "name" | "items" | "recipients">;

/** Valide et normalise une donnée décodée (fichier JSON exporté ou lien/QR
 * compact) vers un ImportPayload. Lève une erreur si la forme ne ressemble
 * pas à un export de liste de cadeaux — les deux sources sont aussi peu
 * dignes de confiance qu'un message websocket forgé à la main (voir
 * `importState` dans worker/reducer.ts, qui revalide de toute façon chaque
 * champ à l'application). */
export function parseImportPayload(data: unknown): ImportPayload {
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as ImportPayload).items) ||
    !Array.isArray((data as ImportPayload).recipients)
  ) {
    throw new Error("Ce contenu ne ressemble pas à un export de liste de cadeaux.");
  }
  // items/recipients sont déjà garantis être des tableaux par les
  // vérifications ci-dessus (jamais `undefined` ici) : pas de repli `?? []`
  // à faire, sous peine d'ajouter un mutant équivalent (code mort jamais
  // atteint) au score de mutation.
  const parsed = data as ImportPayload & { name?: unknown };
  return {
    name: typeof parsed.name === "string" ? parsed.name : "",
    items: parsed.items,
    recipients: parsed.recipients,
  };
}
