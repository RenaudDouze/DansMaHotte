export interface AccessibilityPreference {
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
}

const KEY = "dmh:a11y";

const DEFAULT_PREFERENCE: AccessibilityPreference = { largeText: false, highContrast: false, reduceMotion: false };

// Réglage personnel par appareil (comme le thème), jamais synchronisé via le
// ListState partagé. Reste sur les valeurs par défaut (tout désactivé) si
// rien n'est stocké, si la valeur stockée est invalide (y compris l'ancien
// format `"on"`/`"off"` d'avant le passage à trois réglages indépendants),
// ou si localStorage est indisponible.
export function getAccessibilityPreference(): AccessibilityPreference {
  try {
    // Rien de stocké (`null`) : JSON.parse(null) vaut `null`, dont la lecture
    // d'une propriété lève — le `catch` ci-dessous donne alors les défauts.
    const parsed = JSON.parse(localStorage.getItem(KEY) as string);
    return {
      largeText: parsed.largeText === true,
      highContrast: parsed.highContrast === true,
      reduceMotion: parsed.reduceMotion === true,
    };
  } catch {
    return { ...DEFAULT_PREFERENCE };
  }
}

// Trois attributs booléens indépendants sur <html>, lus par style.css
// ([data-large-text]/[data-high-contrast]/[data-reduce-motion]) — plutôt
// qu'un seul `data-a11y` regroupant tout, pour permettre à chacun d'être
// activé séparément selon le besoin réel de la personne.
export function applyAccessibilityPreference(pref: AccessibilityPreference): void {
  const root = document.documentElement;
  root.toggleAttribute("data-large-text", pref.largeText);
  root.toggleAttribute("data-high-contrast", pref.highContrast);
  root.toggleAttribute("data-reduce-motion", pref.reduceMotion);
}

export function setAccessibilityPreference(pref: AccessibilityPreference): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pref));
  } catch {
    // storage unavailable, preference just won't persist across reloads
  }
  applyAccessibilityPreference(pref);
}
