# DansMaHotte

Une liste de cadeaux de Noël partagée en temps réel, sur le même modèle que
[KoiKiManke](https://github.com/RenaudDouze/KoiKiManke) (liste de courses) :
à héberger entièrement sur Cloudflare (Workers + Durable Objects, sans base
de données externe).

## Fonctionnalités

- **Partage en temps réel** : chaque liste vit dans un Durable Object
  identifié par un code à 6 caractères ; tous les appareils connectés sont
  synchronisés instantanément via WebSocket.
- **Partage facile** : code, QR code et lien direct (`/l/CODE`), avec le
  partage natif du téléphone quand il est disponible.
- **Saisie libre avec quantité mise en avant** : tape par exemple `2x Lego`,
  l'app détecte la quantité et l'affiche dans un badge séparé, modifiable en
  un clic.
- **Personnes** : les catégories sont les prénoms des gens à qui on offre —
  crée une personne, fais glisser les cadeaux vers elle, réordonne les
  personnes elles-mêmes.
- **Déplacement des cadeaux** par glisser-déposer (souris et tactile).
- **Statut par cadeau** : Idée, Acheté, Commandé, Reçu, À plusieurs ou
  Emballé — choisi dans un petit menu coloré, sur le même principe que sur
  OnMangeQuoi.
- **Photo par cadeau** : ajoute une photo ou une capture d'écran à un cadeau
  (ex: le produit repéré en ligne), consultable en plein écran et
  remplaçable/supprimable à tout moment.
- **Import / export** au format JSON, avec fusion ou remplacement à
  l'import.
- **Hors-ligne minimal** : la dernière version connue de chaque liste est
  gardée en cache local, avec reconnexion automatique.
- **Installable (PWA)** : manifest + service worker, s'ajoute à l'écran
  d'accueil et se relance instantanément (shell mis en cache).
- **Annulation** : supprimer un cadeau/une personne ou vider les cadeaux
  cochés propose 5 secondes pour annuler, plutôt qu'une confirmation
  bloquante.
- **Thème clair/sombre/auto**, au choix (bouton dans le menu ⋮ et sur
  l'accueil), en plus de la détection système par défaut.
- **Recherche** rapide des cadeaux par nom.
- **Petite célébration** quand le dernier cadeau est coché.
- **Couleur automatique par personne** et icônes cohérentes (pas d'emoji
  dépendants de la plateforme) pour une interface plus lisible.
- **Accessibilité** : focus piégé et restauré dans les modales, navigation
  clavier.
- **Chiffrement au repos** : les données de chaque liste sont chiffrées sur
  le serveur (voir [Confidentialité](#confidentialité)).

Contrairement à KoiKiManke, il n'y a pas de suggestions/historique d'articles
déjà utilisés : les cadeaux sont plus personnels et rarement répétés d'une
liste à l'autre, une mémoire globale n'aurait pas de sens ici.

## Confidentialité

Le seul contrôle d'accès à une liste est son code à 6 caractères : il n'y a
ni compte ni mot de passe. Toute personne qui obtient le code peut voir et
modifier la liste — un rappel affiché sur l'écran d'accueil et dans la liste
le précise aux utilisateurs.

Les données de toute liste sont chiffrées au repos côté serveur (AES-GCM,
clé dérivée du code de la liste — voir `worker/crypto.ts`) : ça protège
contre un accès direct au stockage brut du Durable Object sans connaître le
code, mais pas contre quelqu'un qui a déjà le code/lien de partage, qui peut
ouvrir la liste normalement. Les photos jointes aux cadeaux, stockées à part
dans un bucket R2, ne sont en revanche pas chiffrées.

## Stack technique

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) +
  [Durable Objects](https://developers.cloudflare.com/durable-objects/)
  (une instance par liste, stockage + diffusion WebSocket) +
  [R2](https://developers.cloudflare.com/r2/) (photos des cadeaux).
- [Vite](https://vite.dev/) + [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/)
  pour un dev loop unique (front + Worker tournent dans le même processus,
  avec `workerd`) + [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/)
  pour le manifest/service worker.
- TypeScript, sans framework front (DOM direct) pour rester léger.
- [`qrcode`](https://www.npmjs.com/package/qrcode) pour générer les QR codes
  côté client.

## Démarrer en local

```bash
npm install
npm run dev
```

Ouvre l'URL affichée (`http://localhost:5173` par défaut). Le plugin
Cloudflare fait tourner le Worker et le Durable Object localement.

## Déployer sur Cloudflare

```bash
npm run deploy
```

Ceci build le front (`vite build`, qui produit aussi une config Wrangler
prête à l'emploi dans `dist/`) puis déploie avec `wrangler deploy`. Il faut
être connecté à un compte Cloudflare (`npx wrangler login` la première
fois), avec un bucket R2 nommé `dansmahotte-item-images` déjà créé (ou
laisser `.github/workflows/deploy.yml` s'en charger en CI, où c'est fait
automatiquement et sans risque à chaque déploiement).

## Déployer sur GitHub Pages

L'app est aussi accessible via une URL `github.io`, en plus de l'URL
Cloudflare Workers : le client est alors servi par GitHub Pages mais parle
toujours à l'unique Worker Cloudflare (API + WebSocket temps réel) via CORS,
donc les deux URLs donnent accès aux mêmes listes partagées.

C'est géré par `.github/workflows/pages.yml`, qui build le client avec
`VITE_SYNC_WORKER_URL` pointant vers l'URL publique du Worker (variable de
dépôt `vars.DEPLOY_URL`, la même que celle utilisée par `deploy.yml`) puis
publie `dist/client` sur GitHub Pages. Rien à faire manuellement une fois
Pages activé une première fois dans Settings → Pages (Source: "GitHub
Actions") ; `VITE_SYNC_WORKER_URL` absente (déploiement Cloudflare seul) =
chemins `/api/...` relatifs, comportement inchangé.

## Structure du projet

```
worker/            Worker Cloudflare (routes API, dont l'upload/suppression
                    de photo), Durable Object ListRoom, et reducer.ts
                    (logique pure, testée unitairement)
shared/            Types et logique partagés entre le Worker et le client
                    (parsing de quantité inclus)
src/                Application front (vue Accueil / vue Liste, composants,
                    utilitaires : websocket, drag & drop, stockage local…)
e2e/                Tests fonctionnels Playwright (parcours principal, sync
                    temps réel multi-appareils)
wrangler.json       Configuration Cloudflare (Durable Object, bucket R2,
                    rate limiter, assets SPA)
```

## Qualité et CI/CD

```bash
npm run lint          # oxlint
npm run typecheck
npm run test:coverage # Vitest — logique pure (shared/, worker/reducer.ts,
                       # worker/index.ts), 100% de couverture
npm run test:e2e      # Playwright, contre `vite dev`
```

`worker/listRoom.ts` (la fine couche Durable Object : stockage, hibernation
WebSocket) n'est volontairement pas couvert par les tests unitaires — toute
sa logique métier vit dans `worker/reducer.ts`, entièrement testé ; le
comportement de `listRoom.ts` lui-même est vérifié par les tests e2e contre
une vraie instance `vite dev` (Worker + Durable Object réels via `workerd`).

`.github/workflows/` : `ci.yml` (lint, typecheck, tests + couverture, e2e,
audit, build) et `deploy.yml` (déploiement Cloudflare gaté sur la réussite
de la CI via `workflow_run`, jamais sur un simple push direct ; création
idempotente du bucket R2 ; vérification post-déploiement ; tag `deploy-N` à
chaque déploiement réussi pour pouvoir identifier/revenir à une version).
Dependabot et CodeQL sont aussi configurés.

## Modèle de données

Chaque liste est un unique objet JSON stocké dans son Durable Object :
cadeaux et personnes (les destinataires). Les mutations (ajout, coche,
déplacement, personnes, photo…) sont envoyées en WebSocket sous forme de
petits messages typés (`shared/types.ts`), appliquées côté serveur,
persistées puis rediffusées à tous les clients connectés. Les photos jointes
aux cadeaux sont stockées à part, dans un bucket R2 (`worker/index.ts`),
identifiées par le code de la liste et l'id du cadeau.
