const KEY = "dmh:deviceName";

// Un nom "animal + adjectif" plutôt qu'un identifiant : lisible, amical, et
// suffisamment de combinaisons (12x12 = 144) pour que deux appareils sur la
// même liste tombent rarement sur le même.
const ANIMALS = ["Renard", "Chat", "Hibou", "Panda", "Loutre", "Lynx", "Corbeau", "Lapin", "Écureuil", "Dauphin", "Faucon", "Blaireau"];
const ADJECTIVES = ["curieux", "discret", "malicieux", "rapide", "joyeux", "calme", "vif", "espiègle", "attentif", "gourmand", "rêveur", "futé"];

function generateDeviceName(): string {
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  return `${animal} ${adjective}`;
}

/** A friendly display name for this browser/device, used only to show who
 * else is on a shared list (see the presence indicator in list.ts) — never
 * an account, generated once and kept stable across reloads via localStorage. */
export function getDeviceName(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
  } catch {
    // localStorage unavailable (private browsing…) — fall through to a
    // freshly generated, unpersisted name.
  }
  const name = generateDeviceName();
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // ignore — the name just won't persist across reloads
  }
  return name;
}
