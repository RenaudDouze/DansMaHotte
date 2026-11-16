// Remplace « virtual:pwa-register » (module généré par vite-plugin-pwa, absent
// sous Vitest) : alias déclaré dans vitest.config.ts. Les tests de main.ts le
// remplacent de toute façon par un espion.
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return async () => {};
}
