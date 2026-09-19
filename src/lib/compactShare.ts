import * as LZString from "lz-string";
import { parseImportPayload, type ImportPayload } from "./importPayload";

/** Encode un instantané de liste (nom, cadeaux, personnes) en une chaîne
 * compacte, compressée (lz-string) et sans octet réservé dans une URL —
 * assez courte pour tenir dans un lien ou un QR code, sans jamais transiter
 * par le serveur ni donner accès à la liste en direct (voir
 * buildCompactShareUrl dans importExport.ts). */
export function encodeCompactShare(payload: ImportPayload): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

/** Décode une chaîne produite par encodeCompactShare. Retourne `null` si le
 * paramètre est manquant, corrompu, ou ne correspond pas à un instantané de
 * liste de cadeaux valide — jamais moins digne de confiance qu'un fichier
 * importé à la main (voir parseImportPayload).
 *
 * Un seul bloc try/catch plutôt qu'un retour anticipé après la décompression
 * ou après le JSON.parse : dans tous les cas d'entrée invalide (paramètre
 * manquant, chaîne corrompue, JSON tronqué...), LZString.decompressFromEncodedURIComponent
 * renvoie une valeur qui fait de toute façon échouer JSON.parse ou
 * parseImportPayload, intercepté ci-dessous — un retour anticipé séparé
 * n'y changerait rien, seulement du code mort du point de vue du résultat. */
export function decodeCompactShare(encoded: string | null | undefined): ImportPayload | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded ?? "");
    return parseImportPayload(JSON.parse(json ?? "null"));
  } catch {
    return null;
  }
}
