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

### 1.2 Bind the scrubber to the real video element — DONE 2026-08-31
`src/pages/WatchPage.jsx`

**What was found:** the bar and the `<video>` never coexisted — the bar rendered under
`{!playbackUrl && …}` and the element under `{playbackUrl ? …}`, with native `controls` on. So
this was not a listener swap: the bar had to become the actual control surface.

**What was done:** native `controls` removed, the bar now renders over both poster and video,
and every control is wired to the element — `timeupdate`/`loadedmetadata`/`play`/`pause`/`ended`
in, `seekTo()`/`play()`/`pause()`/`muted`/`requestFullscreen()` out. Duration comes from the
element, falling back to `durationMinutes` only until metadata arrives. The `setInterval` is
gated on `!playbackUrl` so it can never run alongside the element.

**Verified:** the seeded sample URLs return 403 on this network, so a local clip was generated
with ffmpeg to exercise the element. Duration read 20s (not the catalog's 52-minute estimate),
the label tracked playback (`00:02 / 00:20` at `currentTime` 2.34), dragging to 75% moved the
element to 15.34s, the play button paused and resumed it, and mute flipped `video.muted`.

### 1.3 Replace `alert()` with in-UI error state — DONE 2026-08-31
`src/pages/WatchPage.jsx`

**What was done:** playback failures render inside the player surface with a Retry button,
matching `ContentRow`'s pattern. Scope grew by one case: a failing `<video>` element was just as
silent as the dialog was jarring, so `onError` is handled too and `MediaError.code` is mapped to
a readable message. Retry clears `playbackUrl` before refetching — the same stream resolves to
the same URL, and React would not remount the element for an unchanged `src`.

**Verified:** the seeded sample URLs 403 on this network, which exercised the element path
naturally (*"This stream could not be loaded."*, `MediaError.code` 4); the request path was
forced by rejecting `/playback` fetches (*"Unable to connect to streaming server…"*). `alert`
was stubbed during both and never called. No browser dialogs remain anywhere in `src/`.

### 1.4 Fix the hero description — DONE 2026-08-31
`src/pages/Home.jsx`

**What was found:** removing the hardcoded string was not enough. `/titles/trending` returns the
card projection, which deliberately has no `description`, so truncating
`featuredTitle.description` would have replaced wrong copy with *no* copy.

**What was done:** the hero fetches the featured title's own record from `/titles/:id` for its
description, truncates at a word boundary past `DESCRIPTION_LIMIT`, and only renders the
"Read more" toggle when something is actually hidden behind it.

**Verified:** the page shows the seeded title's real 100-character description, no toggle, and
the *Undertow* copy is gone from the DOM entirely.

### 1.5 Make the CORS allowlist real — DONE 2026-08-31
`server/server.js`

Unlisted origins are warned about and allowed when `NODE_ENV !== "production"`, so local tooling
on arbitrary ports keeps working, and refused by withholding the header otherwise —
`callback(null, false)` rather than throwing, so a blocked origin does not become a 500.

**Verified:** dev allows `https://evil.example.com` with a logged warning; production returns no
`Access-Control-Allow-Origin` for it while still sending one for `https://onion.tv`.

**Found while doing this:** `dotenv.config()` sat below the imports, and ESM evaluates imports
first, so every service module reading `process.env` at its top level saw `undefined` — the
whole `server/.env` provider surface was inert. Now loaded with `import "dotenv/config"` first.

### 1.6 Surface pool-fetch failures — DONE 2026-08-31
`src/pages/Home.jsx` — a failed pool fetch sets `errorPool` and renders one `ContentRow` error
with Retry in place of Originals and the genre rows.

**Verified:** with `?limit=100` forced to fail, the page shows *"Couldn't load the catalog — try
again"* with a Retry button while the hero and Trending row — a different request — still
render.

### 1.7 Housekeeping — DONE 2026-08-31
- Removed the unused `import { argv } from "process"` from `server/test-api.js`.
- Rewrote the root `README.md`; it points at `docs/` and warns about the seed script.
- Unified the stray `#7C3FC4` onto `colors.accent` via a new `withAlpha()` helper in
  `theme.js`, so overlays can use the palette at partial opacity instead of a near-miss hex.
  `index.html` keeps a literal — it cannot import the palette — but now the correct one.
- **`StudioPage.jsx` deleted** (D3, decided 2026-08-31). It simulated an upload with a timer
  against no endpoint, no storage and no auth, and uploads are an explicit PRD non-goal. Routing
  it would have shipped a form that silently discards whatever someone gives it, which is worse
  than not offering one. Recoverable from git if the product direction changes.

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
