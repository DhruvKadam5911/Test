# Onion TV — Implementation Plan

> **Status:** Living document. Last updated 2026-08-31.
> This is the *ordered* build sequence. Live status of each item lives in [tracker.md](tracker.md).
> When you finish an item, update tracker.md in the same commit.

---

## Phase 0 — Done

| # | Item | Evidence |
|---|------|----------|
| 0.1 | Prisma schema + init migration | `20260801204021_init` |
| 0.2 | Express API — titles list, trending, detail, playback | `titlesController.js` |
| 0.3 | Seed catalog | `prisma/seed.js` — 3 titles |
| 0.4 | Netflix-style Home — hero, rows, search | `pages/Home.jsx` |
| 0.5 | Watch page — player, episodes, recommendations | `pages/WatchPage.jsx` |
| 0.6 | Splash intro with synthesized audio | `components/SplashIntro.jsx` |
| 0.7 | API smoke test | `server/test-api.js`, `npm test` |
| 0.8 | Provider abstraction seams | `services/videoProvider.js`, `services/tmdb.js` |

---

## Phase 1 — Stabilise what exists

**Goal:** everything currently shipped behaves correctly. No new features.
**Exit criteria:** clean console, no simulated behaviour presented as real, `npm test` green.

### 1.1 Fix the splash audio lifecycle — DONE 2026-08-31
`src/components/SplashIntro.jsx`

React StrictMode double-invokes effects in dev, so the whole soundtrack schedules twice, and a
fresh `AudioContext` is created on every mount without ever being closed on the non-suspended
path. Browsers cap AudioContexts around six, so repeated mounts eventually go silent.

**What was done:** the context is held in `audioCtxRef`, and the effect returns a cleanup that
closes it. Under StrictMode the discarded first pass is torn down within milliseconds, so only
the surviving context is ever audible and nothing outlives the component. `handleInteraction`
now calls `resume()` on that same context instead of constructing a second one.

**Verified:** instrumented `window.AudioContext` in the running page and forced remounts — every
context created reached state `closed`, none leaked. Lint clean for this file; `npm run build`
passes; splash and home render correctly.

**Note:** the `[Audio Log]` lines still print twice per load in dev. That is StrictMode
re-invoking the effect, not a second soundtrack — the first context is closed before it can be
heard. Suppressing those logs would mean defeating StrictMode's second pass, which is not worth
doing.

### 1.2 Bind the scrubber to the real video element — *P0*
`src/pages/WatchPage.jsx`

Replace the `setInterval` simulation with `timeupdate` / `loadedmetadata` / `ended` listeners on
a `videoRef`. Keep the simulation only for the pre-play poster state, or drop it entirely.

**Verify:** play a title, seek — the scrubber and the video agree.

### 1.3 Replace `alert()` with in-UI error state — *P0*
`src/pages/WatchPage.jsx` — playback fetch failure should render inside the player surface with
a retry button, matching `ContentRow`'s existing error pattern.

### 1.4 Fix the hero description — *P1*
`src/pages/Home.jsx` — the truncated branch renders a hardcoded *Undertow* string. Truncate
`featuredTitle.description` instead, and only show "Read more" when it actually overflows.

### 1.5 Make the CORS allowlist real — *P1*
`server/server.js` — the `else` branch calls `callback(null, true)`, so `allowedOrigins` does
nothing. Reject unknown origins outside development, or delete the list and document that CORS
is intentionally open.

### 1.6 Surface pool-fetch failures — *P1*
`src/pages/Home.jsx` — `fetchPool()` only logs on failure, so Originals and every genre row
vanish silently. Give it the same error + retry treatment as trending.

### 1.7 Housekeeping — *P2*
- Remove the unused `import { argv } from "process"` from `server/test-api.js:1`.
- Rewrite the root `README.md` — it is still the Vite template. Point it at `docs/`.
- Decide `StudioPage.jsx`: route it, or delete it. Unreachable code rots.
- Unify the stray `#7C3FC4` usages onto `colors.accent`.

---

## Phase 2 — Real video delivery

**Goal:** streams come from a real provider, not Google's public sample bucket.
**Blocked on:** a product decision — Cloudflare Stream or JW Player (see PRD §6).

### 2.1 Pick the provider
Decision needed before any code. Record it in this document once made.

### 2.2 Implement the provider block
`server/src/services/videoProvider.js` — the TODO block already sketches the Cloudflare call.
Fill in exactly one branch; leave the other throwing.

### 2.3 Signed, expiring URLs
Stream URLs must not be permanently valid. Return a short-lived signed URL from
`/titles/:id/playback` and let the client refetch on expiry.

### 2.4 HLS playback
`<video src>` handles MP4 but not HLS in every browser. Add `hls.js` with a native-HLS
fallback for Safari.

### 2.5 Migrate seed and catalog data
Replace sample MP4 URLs with provider media IDs. Update `seed.js` and `schema.md`.

---

## Phase 3 — Accounts

**Goal:** activate the `User` model. **Blocked on:** PRD §6 — does v1 need accounts at all?

### 3.1 Auth endpoints
`POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
bcrypt for `passwordHash`, JWT signed with the already-provisioned `JWT_SECRET`.

### 3.2 Auth middleware
`requireAuth` attaching `req.user`. Apply it to `/titles/:id/playback` — the controller comment
already claims "(Requires Auth)" and that is currently false.

### 3.3 Frontend auth context
React context + token storage; extend `src/api/client.js` to attach the Authorization header.
The client's `post` and `delete` helpers already exist and are unused — this is their first user.

### 3.4 Sign in / sign up screens
New routes. Note git history shows a sign-in system was deliberately removed in `0f4f40b`;
check that commit before rebuilding it.

---

## Phase 4 — Personalisation

**Depends on Phase 3.**

### 4.1 Watch progress
`PUT /titles/:id/progress`, `GET /me/progress`. Write from the `timeupdate` handler built in 1.2,
throttled to roughly every 10 seconds.

### 4.2 Continue Watching row
A new `ContentRow` on Home, above Trending, with a progress bar overlay on each card.

### 4.3 My List
`POST` / `DELETE /me/list`, `GET /me/list`. Add a toggle to `ContentCard` and `WatchPage`.

---

## Phase 5 — Catalog operations

### 5.1 Server-side search
`GET /titles/search?q=` with a database `contains` filter. Home's client-side filter silently
misses anything past the 100-title pool.

### 5.2 Real trending
`/titles/trending` is currently "10 newest". Base it on view counts once watch progress exists.

### 5.3 Pagination / infinite scroll
`limit` and `offset` already exist on `/titles`; nothing uses them beyond `limit=100`.

### 5.4 TMDB enrichment
Implement `services/tmdb.js` to auto-fill descriptions, artwork and ratings on catalog import.

### 5.5 Admin catalog CRUD
Replace "edit `seed.js`" as the way to add content.

---

## Phase 6 — Production readiness

| # | Item |
|---|------|
| 6.1 | 404 route — unmatched paths render blank today |
| 6.2 | Error boundary around the router |
| 6.3 | Rate limiting on the API |
| 6.4 | Structured logging to replace `console.error` |
| 6.5 | Real test suite — `test-api.js` is a smoke test, not coverage |
| 6.6 | CI: lint, build, smoke test |
| 6.7 | Deployment — build hosting, API hosting, managed Postgres, migration step |
| 6.8 | Accessibility pass — focus states, keyboard nav on rows and the scrubber, alt text |
| 6.9 | Performance — the splash blocks first paint for 3.1s |

---

## Sequencing rules

1. **Phase 1 before anything else.** Do not add features on top of simulated playback.
2. Phase 2 and Phase 3 are independent and can run in parallel.
3. Phase 4 hard-depends on Phase 3.
4. Every phase updates [tracker.md](tracker.md) and any doc whose facts it changes.
