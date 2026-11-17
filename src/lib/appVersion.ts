// Numéro de version affiché dans l'interface (VER-09), injecté à la construction
// par la config Vite (`define`, voir .github/scripts/app-version.mjs).
declare const __APP_VERSION__: string;

export const APP_VERSION: string = __APP_VERSION__;
