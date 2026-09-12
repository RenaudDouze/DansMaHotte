// En déploiement mono-origine (Cloudflare Workers sert aussi le client),
// VITE_SYNC_WORKER_URL est absente et les chemins /api/... restent relatifs.
// En déploiement GitHub Pages, le client est servi séparément du Worker :
// cette variable (injectée au build, voir .github/workflows/pages.yml)
// pointe vers l'URL publique du Worker pour que l'API et le WebSocket
// fonctionnent malgré l'origine différente.
const workerUrl = (import.meta.env.VITE_SYNC_WORKER_URL as string | undefined)?.replace(/\/$/, "");

export function apiUrl(path: string): string {
  return workerUrl ? `${workerUrl}${path}` : path;
}

export function wsUrl(path: string): string {
  if (workerUrl) return `${workerUrl.replace(/^http/, "ws")}${path}`;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}
