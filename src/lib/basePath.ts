// Sur Cloudflare Workers, l'app est servie à la racine du domaine (base
// "/"). Sur GitHub Pages (dépôt de projet, pas un dépôt <user>.github.io),
// elle est servie sous un sous-chemin (ex: "/dansmahotte/", voir `base` dans
// vite.config.ts et VITE_BASE_PATH dans .github/workflows/pages.yml) :
// import.meta.env.BASE_URL reflète ce sous-chemin (toujours terminé par
// "/"), et ces deux fonctions gardent le routeur et les liens de partage
// corrects dans les deux cas sans le savoir explicitement.
const BASE_PATH = import.meta.env.BASE_URL as string;

/** Préfixe un chemin absolu de l'app (ex: "/l/ABCDEF") par le sous-chemin de déploiement. */
export function appPath(path: string): string {
  return path === "/" ? BASE_PATH : BASE_PATH.slice(0, -1) + path;
}

/** L'équivalent de location.pathname, débarrassé du sous-chemin de déploiement. */
export function routePath(): string {
  const { pathname } = location;
  return pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length - 1) : pathname;
}
