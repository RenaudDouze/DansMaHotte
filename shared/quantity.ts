// Parses a free-form item entry like "2 kg pommes" or "yaourts x8" into a
// separate quantity label and item name, so the UI can show the quantity
// prominently even though the user typed everything in one go.

const UNITS = [
  "kg",
  "g",
  "gr",
  "l",
  "cl",
  "ml",
  "paquet",
  "paquets",
  "boite",
  "boites",
  "boîte",
  "boîtes",
  "bouteille",
  "bouteilles",
  "sachet",
  "sachets",
  "pot",
  "pots",
  "pcs",
  "piece",
  "pieces",
  "pièce",
  "pièces",
  "tranche",
  "tranches",
];

const UNIT_PATTERN = UNITS.join("|");

const NUMBER_UNIT = new RegExp(`^(\\d+(?:[.,]\\d+)?)(${UNIT_PATTERN})$`, "i");
const BARE_NUMBER = /^(\d+(?:[.,]\d+)?)$/;
const X_PREFIX = /^[xX](\d+)$/;
const X_SUFFIX = /^(\d+)[xX]$/;
const UNIT_WORD = new RegExp(`^(${UNIT_PATTERN})$`, "i");

export interface ParsedEntry {
  name: string;
  quantity: string;
}

function normalizeUnit(n: string, unit: string): string {
  return `${n.replace(",", ".")} ${unit.toLowerCase()}`;
}

/** Tries to read a quantity out of a single token, e.g. "500g", "x3", "3x", "2". */
function matchSingleToken(token: string): string | null {
  let m = token.match(NUMBER_UNIT);
  if (m) return normalizeUnit(m[1], m[2]);
  m = token.match(X_PREFIX);
  if (m) return `x${m[1]}`;
  m = token.match(X_SUFFIX);
  if (m) return `x${m[1]}`;
  m = token.match(BARE_NUMBER);
  if (m) return m[1].replace(",", ".");
  return null;
}

export function parseFreeText(raw: string): ParsedEntry {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return { name: "", quantity: "" };

  const words = trimmed.split(" ");

  // Two-word quantity at the start, e.g. "2 kg pommes". `>= 2` (not `>= 3`)
  // is intentional: "2 kg" alone should parse as quantity "2 kg" with an
  // empty name (silently ignored by callers), not fall through to the
  // single-token check below and get split into quantity "2" / name "kg".
  if (words.length >= 2 && BARE_NUMBER.test(words[0]) && UNIT_WORD.test(words[1])) {
    return {
      quantity: normalizeUnit(words[0], words[1]),
      name: words.slice(2).join(" "),
    };
  }
  // Two-word quantity at the end, e.g. "pommes 2 kg".
  if (words.length >= 2 && BARE_NUMBER.test(words[words.length - 2]) && UNIT_WORD.test(words[words.length - 1])) {
    return {
      quantity: normalizeUnit(words[words.length - 2], words[words.length - 1]),
      name: words.slice(0, -2).join(" "),
    };
  }

  if (words.length >= 2) {
    const first = matchSingleToken(words[0]);
    if (first !== null) {
      return { quantity: first, name: words.slice(1).join(" ") };
    }
    const last = matchSingleToken(words[words.length - 1]);
    if (last !== null) {
      return { quantity: last, name: words.slice(0, -1).join(" ") };
    }
  }

  return { name: trimmed, quantity: "" };
}
