// Chiffrement symétrique (AES-GCM) du contenu d'une liste "privée", pour que
// le stockage du Durable Object ne conserve pas les données en clair (voir
// worker/listRoom.ts). La clé est dérivée du code de la liste : ça protège
// contre un accès direct au stockage brut sans connaître le code, pas contre
// quelqu'un qui a déjà le code/lien de partage (qui peut de toute façon
// ouvrir la liste normalement, comme sans le mode privé).

export interface EncryptedPayload {
  /** Base64, aléatoire à chaque appel : jamais réutilisé avec la même clé. */
  iv: string;
  ciphertext: string;
}

async function deriveKey(code: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptJson(code: string, value: unknown): Promise<EncryptedPayload> {
  const key = await deriveKey(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptJson<T>(code: string, payload: EncryptedPayload): Promise<T> {
  const key = await deriveKey(code);
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.ciphertext);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}
