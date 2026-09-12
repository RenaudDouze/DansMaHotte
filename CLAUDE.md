# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DansMaHotte is a real-time shared Christmas gift list app, on the same model as the sibling project KoiKiManke (shared grocery list): fully hosted on Cloudflare (Workers + Durable Objects, no external database). Comments and commit messages in this codebase are in French; keep that convention when editing existing files.

## Commands

```bash
npm run dev            # vite dev — front + Worker in one process (workerd), at http://localhost:5173
npm run build          # typecheck, then vite build (client + worker bundle into dist/)
npm run deploy         # build, then wrangler deploy to Cloudflare
npm run lint           # oxlint --deny-warnings
npm run typecheck      # tsc --noEmit against tsconfig.worker.json, then tsconfig.client.json
npm run test           # vitest run (unit tests, once)
npm run test:watch     # vitest, watch mode
npm run test:coverage  # vitest run --coverage — enforces 100% on the files it covers (see below)
npm run test:e2e       # playwright test, against a vite dev server it starts itself
npm run cf-typegen     # regenerate Cloudflare env types from wrangler.json
```

Running a single test:

```bash
npx vitest run worker/reducer.test.ts        # one unit test file
npx vitest run -t "nom du test"              # by test name
npx playwright test e2e/interface.spec.ts    # one e2e file
npx playwright test e2e/interface.spec.ts -g "nom du test"
```

There are two separate `tsconfig` projects (`tsconfig.worker.json` for `worker/` + `shared/`, `tsconfig.client.json` for `src/` + `shared/`) because they target different lib sets (Cloudflare Workers types vs. DOM) — `npm run typecheck` runs both. `npm run deploy` requires being logged in to Cloudflare (`npx wrangler login`) and an R2 bucket named `dansmahotte-item-images` (created automatically in CI, see `.github/workflows/deploy.yml`).

## Architecture

### Split: worker / shared / src

- `worker/` — the Cloudflare Worker: HTTP routing (`index.ts`), the `ListRoom` Durable Object (`listRoom.ts`), the pure state-mutation reducer (`reducer.ts`), at-rest encryption (`crypto.ts`).
- `shared/types.ts` — the only types shared by both sides: `ListState`/`Item`/`Recipient`, and the `ClientMessage`/`ServerMessage` discriminated unions that form the entire client↔server protocol (sent over WebSocket, JSON-encoded).
- `src/` — the client: no framework, direct DOM manipulation via template-literal HTML strings + `querySelector`/`addEventListener` wiring. `src/views/` (home, list), `src/components/` (self-contained modals), `src/lib/` (websocket client, drag & drop, local preferences, etc).

### Request flow (`worker/index.ts` → `ListRoom`)

One `ListRoom` Durable Object instance per list, looked up by `idFromName(code)` (the 6-character list code, e.g. `env.LIST_ROOM.idFromName(code)`) — the code itself is the DO's identity, there's no separate lookup table. `worker/index.ts` handles:
- `POST /api/lists` — creates a list, retrying `generateCode()` up to 5 times if the code already names an existing DO.
- `GET /api/lists/:code` — fetches current state (internally: worker calls the DO's `/state`-equivalent, no path, just method-based routing inside the DO).
- `GET /api/lists/:code/ws` — forwarded to the DO **unchanged** (the raw `Request`, not reconstructed) so the WebSocket upgrade handshake headers survive.
- `PUT`/`GET`/`DELETE /api/lists/:code/items/:id/image` — item photos, stored in R2 (`ITEM_IMAGES` binding), rate-limited on write by `CF-Connecting-IP` (`IMAGE_WRITE_RATE_LIMITER`, 20/min). A successful image PUT/DELETE replays a `setItemImage` message into the DO via its internal `/apply` route, so it goes through the exact same validation/persistence/broadcast path as a message sent over the WebSocket.

CORS headers are added explicitly for the JSON/image routes (needed because the GitHub Pages deployment calls a Cloudflare Worker on a different origin) but never for the WebSocket route, which browsers don't subject to CORS.

### `ListRoom` (Durable Object)

- Loads its state lazily (`ensureLoaded`) from `ctx.storage`, decrypting it if stored encrypted (see below).
- WebSocket handling uses the **hibernation API** (`ctx.acceptWebSocket`, `webSocketMessage`/`webSocketClose` handlers) rather than holding sockets in memory — required for Durable Objects to evict idle instances between messages.
- Every mutation (from a WebSocket message or the `/apply` route used by image upload) goes through `applyAndBroadcast`: apply the pure reducer, persist, then broadcast the new state to every connected socket. There's no fine-grained diffing — the whole `ListState` is rebroadcast each time.
- State is persisted **encrypted** (AES-GCM via `worker/crypto.ts`), keyed by the list's own code — this only guards against direct storage access without the code, not against someone who already has the share code/link. Item photos in R2 are *not* encrypted.

### The reducer (`worker/reducer.ts`)

All state-mutation logic lives here as one pure function, `applyMessage(state, msg, now?)`, mutating `ListState` in place per `ClientMessage` variant. This is deliberately extracted out of `listRoom.ts` so it's testable without any Workers runtime — it's the one file (along with `shared/`) required to be 100% unit-tested (see Testing below). Notably:
- Validation that matters even for a hand-crafted WebSocket message bypassing the client UI happens here, not just client-side: `normalizeLink` (always `""` or an absolute `http(s)` URL), `normalizePrice` (finite, ≥ 0, rounded to the cent), `validRecipientId` (drops references to recipients that don't exist).
- A gift's `checked` flag isn't set independently — it's *derived* from `status === "emballe"` on every `updateItem` that touches `status`.
- `restoreItems`/`restoreRecipient` are compensating actions for the client's undo stack (see below) — they re-insert exactly what a prior delete removed (preserving id/order/checked), rather than the client re-deriving a fresh item.

### Client: routing, views, sync

- `src/main.ts` is the whole router: matches `/l/:code` against `location.pathname` (via `routePath()`/`appPath()` in `src/lib/basePath.ts`, which account for GitHub Pages being served from a sub-path) and mounts either `mountListView` or `mountHomeView` into `#app`, tearing down the previous view's listeners first.
- `src/lib/ws.ts`'s `ListConnection` owns the WebSocket lifecycle: auto-reconnect with capped exponential backoff, queues outgoing messages while disconnected and flushes on reconnect, and exposes `onState`/`onError`/`onConnectionChange` subscriptions. Views apply the entire `ListState` snapshot on every `state` message rather than patching incrementally.
- `src/lib/syncWorker.ts` resolves API/WS URLs: same-origin relative paths when deployed on Cloudflare Workers (client + Worker share an origin), or an absolute `VITE_SYNC_WORKER_URL` when deployed to GitHub Pages (client and Worker are on different origins there).

### Per-device preferences

Theme, item sort order, hide-checked, and accessibility settings are **personal, per-device** and never part of the synced `ListState` — they live in `localStorage` and are reflected as boolean/enum `data-*` attributes on `document.documentElement`, read purely by CSS. All four follow the same shape (`theme.ts` is the canonical example): `get*Preference()`, `apply*Preference()` (sets the DOM attribute), `set*Preference()` (persists + applies). `applyTheme`/`applyAccessibilityPreference` are called once in `main.ts` before the first render, to avoid a flash of the wrong state.

### Modals

Self-contained `openXModal()` functions in `src/components/` (`shareModal.ts`, `accessibilityModal.ts`) render into the DOM, wire their own listeners, and clean up on close — callable from both the home and list views. Shared conventions: `.modal-overlay`/`.modal` CSS classes, `trapFocus()` (`src/lib/focusTrap.ts`) for keyboard accessibility, Escape-to-close, click-outside-to-close.

### Undo

Destructive actions (delete item, clear checked items, delete recipient) push a compensating action onto a client-side undo stack (`pushUndo` in `list.ts`) and show a 5-second-window toast instead of a blocking confirmation dialog. Confirming a destructive action still first requires a second click on the same button within a short window (`src/lib/confirmClick.ts`) — undo is the safety net *after* that.

### Drag & drop, swipe, inline editing

- `src/lib/dnd.ts` — generic pointer-based drag-to-reorder (mouse + touch), used for reordering both items (within/between recipients) and recipients themselves.
- `src/lib/swipe.ts` — swipe-to-delete gesture on mobile.
- `src/lib/editable.ts` — generic "click text to edit it inline" behavior, used for list/item/recipient names.

### CSS: `:root[data-*]` attribute switches

`src/style.css` is one file, organized in commented sections. Per-device preferences (theme, accessibility) are read via attribute selectors on `:root`, mirroring `data-theme` (`light`/`dark`/absent-for-auto). The large-text mode (`data-large-text`) scales the root `font-size`, then explicitly *undoes* that scaling (via the `--a11y-text-scale` custom property) on non-text "chrome" — icon buttons, status/price/photo/link badges, row padding/gaps — so enlarged text doesn't starve dense flex rows of space; only genuinely readable text is meant to grow.

## Testing philosophy

Unit tests (Vitest) and e2e tests (Playwright) deliberately cover different, non-overlapping layers — check `vitest.config.ts`'s `coverage.include`/`exclude` before assuming something needs a unit test:
- **Unit-tested, 100% coverage enforced**: `shared/**` (except the type-only `types.ts`), `worker/**` (except `worker/listRoom.ts`), and only `src/lib/color.ts` + `src/lib/sort.ts` from the client. This is the pure-logic subset — no DOM, no storage, no network.
- **Not unit-tested, covered by Playwright e2e instead**: `worker/listRoom.ts` (the Durable Object's own glue — storage, WebSocket hibernation — would need a real Workers runtime to test meaningfully; all its actual logic already lives in the fully-tested `reducer.ts`) and everything else under `src/` (views, components, DOM/storage/network glue in `src/lib`), run against a real `vite dev` instance (Worker + Durable Object via `workerd`).

When adding client-side behavior, add/extend an e2e spec in `e2e/`, not a unit test for a `src/views`/`src/components` file — it won't count toward coverage and isn't the intended layer for that code.

## CI/CD

- `.github/workflows/ci.yml` runs on every PR and on push to `main`: lint, typecheck, unit tests + coverage, Playwright e2e, `npm audit --audit-level=high`, and finally a production build (gated on all the others passing).
- `.github/workflows/deploy.yml` (Cloudflare) and `pages.yml` (GitHub Pages) both trigger via `workflow_run` once CI succeeds on `main` — never directly on push — plus `workflow_dispatch` as a manual escape hatch if a push-triggered CI run is ever missed (e.g. a dropped webhook) and the deploy chain doesn't fire on its own. `pages.yml` builds with `VITE_SYNC_WORKER_URL` pointing at the Cloudflare Worker's public URL so the GitHub Pages–served client can still reach the same API/WebSocket backend and thus the same shared lists.
- CodeQL and Dependabot are also configured (`.github/workflows/codeql.yml`).

## Privacy model

A list's only access control is its 6-character code — no accounts, no passwords. Anyone with the code can view and edit it (surfaced to users via `src/lib/privacyHint.ts`'s reminder text, shown in several places in the UI). List data is encrypted at rest server-side; item photos in R2 are not. Don't weaken or bypass this reminder, and don't add code-adjacent "security" that implies stronger guarantees than this model actually provides.
