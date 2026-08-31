# Onion TV — Status Tracker

> **Update this file in the same commit as the work it describes.** It is the fastest way for
> anyone — human or AI — to know what is real, what is fake, and what is broken.
> Last updated 2026-08-31.

---

## Snapshot

| | |
|---|---|
| **Branch** | `main` |
| **Live** | https://onion-tv.vercel.app · API https://onion-tv-api.vercel.app · Neon Postgres |
| **Last commit** | `87ccc80` — Add the project documentation suite |
| **Unpushed** | Yes — everything since `125d7f8` is local only |
| **Frontend** | ✅ Runs, Vite 8.2.0 on :5173 |
| **Backend** | ✅ Runs on :5000, database healthy |
| **Smoke test** | ✅ All 5 checks pass |
| **Catalog** | 3 seeded titles |
| **Current phase** | Phase 1 — Stabilise, **complete** (1.1–1.7) |

---

## Feature status

Legend: ✅ working · 🟡 partial or simulated · ⛔ not built · 🗑️ dead code

### Frontend

| Feature | Status | Notes |
|---------|--------|-------|
| Splash intro visuals | ✅ | Two variants by viewport. **Tablet & desktop (≥768px):** the wordmark is constructed — dots → anchor points → drawn outlines → solid, then the mark joins, ~3.2s. **Phone (<768px):** wheel spins through platforms, locks on Onion, mark drops in, others clear, lockup pushes through into the app, ~3.5s |
| Splash intro audio | ✅ | One `AudioContext` per mount, closed on unmount; the click path resumes it rather than opening a second (plan 1.1, 2026-08-31) |
| Splash audio | ✅ | Plays when the browser allows it, silent when it does not. Never blocks the animation |
| Cinematic hero | ✅ | Shows the featured title's real description, fetched from `/titles/:id` since the list projection omits it; "Read more" only appears when something is actually hidden (plan 1.4, 2026-08-31) |
| Trending row | ✅ | With skeleton + retry |
| Onion Originals row | ✅ | Client-side `isOriginal` filter |
| Dynamic genre rows | ✅ | One row per genre from `/titles/genres`, each lazy-fetching its own titles as it scrolls into view |
| Search | ✅ | Server-side across the whole catalog, debounced (plan 5.1, 2026-08-31) |
| Content cards + skeletons | ✅ | |
| PickerWheel | ✅ | Reusable rotating-list component. Loop mode demoed at `/wheel`; settle mode drives the phone splash and the watch-page ident |
| Pre-roll ident | ✅ | `SplashWheel` plays inside the player before every video, ~3.4s. The stream is held back until it finishes so no audio starts underneath |
| Row arrows / scroll | ✅ | |
| Watch page metadata | ✅ | |
| Season / episode picker | ✅ | |
| More Like This | ✅ | Same-genre recommendations |
| Video playback | ✅ | HTML5 `<video>`, MP4 only. Native controls off — the custom bar drives play/pause, seek, mute and fullscreen |
| Scrubber | ✅ | Bound to the element via `timeupdate` / `loadedmetadata`; dragging seeks, and duration comes from the video (plan 1.2, 2026-08-31) |
| Playback error UX | ✅ | In-player message + Retry, covering both a failed request and a failed `<video>` element (plan 1.3, 2026-08-31) |
| Pool-fetch error UX | ✅ | Replaces Originals and the genre rows with one error row + Retry (plan 1.6, 2026-08-31) |
| 404 route | ⛔ | Unmatched paths render blank |
| Auth UI | ⛔ | Removed in `0f4f40b` |
| Continue Watching | ⛔ | |
| My List UI | ⛔ | |

### Backend

| Endpoint / concern | Status | Notes |
|--------------------|--------|-------|
| `GET /` | ✅ | |
| `GET /health` | ✅ | Real `SELECT 1` |
| `GET /titles` | ✅ | genre / contentType / limit / offset |
| `GET /titles/trending` | 🟡 | "10 newest", not real trending — plan 5.2 |
| `GET /titles/:id` | ✅ | Correctly strips playback URLs |
| `GET /titles/:id/playback` | 🟡 | Works, but unauthenticated despite the "(Requires Auth)" comment — plan 3.2 |
| CORS allowlist | ✅ | Enforced outside development; unlisted origins warned about and allowed in dev, refused in production (plan 1.5, 2026-08-31) |
| 404 + error handlers | ✅ | |
| Video provider | ⛔ | Both branches throw; pass-through only — Phase 2 |
| TMDB service | ✅ | Search, details, certification and image URLs implemented; `import-tmdb.js` brings real films into the catalog (plan 5.4, 2026-08-31) |
| Auth | ⛔ | `User` model + `JWT_SECRET` exist, nothing uses them — Phase 3 |
| Watch progress API | ⛔ | Model only — plan 4.1 |
| My List API | ⛔ | Model only — plan 4.3 |
| Rate limiting | ⛔ | |
| Structured logging | ⛔ | `console.error` throughout |

### Data

| Item | Status |
|------|--------|
| Prisma schema, 6 models | ✅ |
| Init migration `20260801204021_init` | ✅ Applied |
| Seed — 3 titles | ✅ |
| Real artwork | ⛔ All thumbnails are CSS gradients |
| Real stream hosting | ⛔ Google public sample MP4s |

---

## Hazards — read before changing related code

| # | Hazard |
|---|--------|
| H1 | **`prisma/seed.js` deletes all six tables before inserting.** Never run it against real data |
| H2 | `server.js` loads env with `import "dotenv/config"` as its **first** import. Do not move it below the others — the service modules read `process.env` at import time, and every key in `server/.env` goes silently undefined if it loads late |
| H3 | The scrubber is real during playback, but falls back to a `setInterval` preview *before* a stream is fetched. That preview timer is gated on `!playbackUrl` — never let it run alongside the element |
| H3f | **Nothing in the catalog plays.** The three seeded demo titles were the only ones with a stream and were deleted on request; everything else is TMDB metadata. The player, the download link and the resolution label are all correct and all have nothing to act on |
| H3e | Series imported from TMDB have no `Season` or `Episode` rows. Playback needs an `episodeId` it cannot supply, so a series card opens to a detail page with no episodes |
| H3d | Titles imported in bulk have no `playbackUrl` and cannot play. That is the accepted cost of cataloguing other platforms' films, not a player bug — check the catalog before diagnosing a playback report |
| H3c | `/admin/refresh` imports from TMDB at runtime, so `TMDB_API_KEY` **is** needed on the deployed API. It is read per call, not at module load, so a key added after a deploy takes effect without one |
| H3b | Google's `gtv-videos-bucket` sample URLs in the seed data return **403** from some networks. If playback fails with `MEDIA_ELEMENT_ERROR`, check the network before suspecting the player |
| H4 | `data/videos.js` is legacy — `videos`, `heroVideo`, `continueWatching`, `trending` are all empty. Only `gradients` is live. Do not read data from it |
| H6 | Setting `VIDEO_PROVIDER` in `.env` without implementing the branch breaks **all** playback |
| H7 | Route order in `routes/titles.js` — `/trending` must stay above `/:id` |
| H8 | `npm run build` runs `tsc -b`. TypeScript errors fail a build in a mostly-JSX codebase |
| H9 | `#7C3FC4` appears in a few places instead of `colors.accent` `#7B2685` |
| H10 | Only the **bulb** comes from `public/logo.png` now, via `OnionMark.jsx`, which crops it on a canvas at runtime — if that file is replaced, check the crop bounds and the white-knockout threshold there. The wordmark is drawn from geometry and is unaffected |
| H10b | The desktop wordmark is hand-authored SVG geometry in `splash/wordmarkGeometry.js`, **not** a font. Changing the wordmark means editing paths and their anchor lists together — the anchors are drawn from the same file so they cannot drift, but only if you edit both |
| H11a | The splash breakpoint is read once at mount and never re-read. That is intentional — do not "fix" it with a resize listener, or a resize will swap the intro mid-animation |
| H11 | `PickerWheel` writes styles straight to DOM nodes from a rAF loop. Do not also drive those same properties from React state or CSS transitions — they will fight each other. `isolate` is safe only because it runs after the loop has finished |

---

## Technical debt

Detailed in [tech-spec.md](tech-spec.md) §7. Originally T1–T10; **T1–T7 resolved 2026-08-31**, three open (T8 client-side search, T9 unauthenticated playback, T10 mixed TS/JS build).

---

## Open decisions

| # | Question | Blocks |
|---|----------|--------|
| D1 | Cloudflare Stream or JW Player? | All of Phase 2 |
| D2 | Does v1 need accounts? | Phase 3, therefore Phase 4 |
| D4 | Where does catalog content come from — manual, TMDB, or uploads? | Phase 5 |
| D5 | Is Fraunces (loaded, unused) part of the type system or should it be dropped? | design.md |
| D6 | Should a wordmark join the mark once the wheel lands, or is the mark beside "Onion" enough? | Splash branding |

---

## Changelog

| Date | Commit | Change |
|------|--------|--------|
| 2026-09-01 | — | The music player has music: Audius and the Internet Archive, both free, both keyless, both serving whole tracks. 6,000+ so far across 26 genres. Spotify and YouTube Music were ruled out — metadata only, or no API, and the projects that get around that redistribute unlicensed audio |
| 2026-09-01 | — | Categories back, but not as they were: twelve genre rows under the four ordered ones, each loading only when scrolled towards, plus a Categories menu in the navbar listing all 29 with their counts and a `/genre/:genre` page behind each. The old version rendered every genre eagerly |
| 2026-09-01 | — | Home page rebuilt: four ordered rows instead of 29 genre rows, ratings on every card, and three hardcoded decorations removed — "FEATURED VOD", a "#1 IN SERIES TODAY" ribbon and a "TV-MA" badge that every title carried. Import now stores TMDB's voteAverage/voteCount/popularity and backfills rows already stored |
| 2026-09-01 | — | `/music` added — a real audio player, empty until tracks exist. Also: backspace in an empty search box no longer navigates away, the player's resolution label reads the element instead of claiming 1080p, and a download link appears when a title has a stream |
| 2026-09-01 | — | The catalog is the whole of TMDB's popular output now: 7,656 → **85,764** titles across 11 languages and both media, films and series, driven through `/admin/refresh` from Vercel because this machine's network drops TMDB and Postgres:5432 alike |
| 2026-09-01 | — | Search moved onto `pg_trgm`. The in-memory index worked at 7,000 titles and broke silently at 85,000 — capped by recency it held only the newest import, so "sholey" stopped finding Sholay. `/admin/reindex` installs the extension and index |
| 2026-09-01 | — | Search survives being typed into, and forgives a typo. The navbar sits inside the hero while browsing and outside it while searching, so the first keystroke remounted it — the box snapped shut and the text vanished, mid-word, every time. Ranking moved out of SQL into `services/titleSearch.js` |
| 2026-08-31 | — | The import can now reach the rest of TMDB: `media=tv` for series (a separate endpoint, field names and genre table), `provider=any` for titles outside the four cron platforms, and `year` for slicing past TMDB's hard 10,000-row-per-query ceiling. `prisma/backfill-catalog.mjs` drives it across every language and both media. The catalog was 7,656 films from four platforms |
| 2026-08-31 | — | `GET /admin/dedupe` added, and `Uncategorised` no longer gets a home-page row or the hero. The three bulk SQL files each de-duplicated only against the catalog as it stood when written, so films in two slices (Sholay, for one) were inserted twice |
| 2026-08-31 | — | The catalog is now actually reachable: server-side search across all titles, `/titles/genres`, and rows that fetch their own genre lazily. The page was showing ~110 of 7,656 titles |
| 2026-08-31 | — | Catalog now refreshes itself: `GET /admin/refresh` imports server-side behind `CRON_SECRET`, with a daily Vercel cron. Used it to load 4,807 Hollywood titles into the live database without any SQL. Live catalog is 7,656 titles, 89% with artwork |
| 2026-08-31 | — | Bulk import hardened for long runs: retries with backoff, failed pages skipped rather than aborting, chunked output, and TMDB's 500-page ceiling enforced. Generated 7,415 titles across Bollywood, Pollywood and Hollywood |
| 2026-08-31 | — | Bulk TMDB import added, filtered by streaming platform and genre. Note the consequence, accepted deliberately: titles imported this way have no stream and will not play |
| 2026-08-31 | — | `import-tmdb.js` gains `--sql`, which prints an `INSERT` instead of writing. Needed because this machine can reach TMDB but Prisma cannot open a connection to Neon, while the deployed API can |
| 2026-08-31 | — | Plan 5.4: TMDB client implemented and a `prisma/import-tmdb.js` CLI added, so the catalog can hold real films with real artwork instead of gradient placeholders |
| 2026-08-31 | — | **D3 decided: Creator Studio deleted.** Uploads are a PRD non-goal, and the page simulated one against no endpoint, no storage and no auth. Routing it would have shipped a form that silently discards what people give it. Phase 1 is now complete |
| 2026-08-31 | — | Found checking the live site on a phone: every row reserved 128px below its cards for the hover expansion, which touch devices never trigger. Gated on `(hover: hover)`, removing ~580px of dead scrolling |
| 2026-08-31 | — | Two fixes found by checking the live site: the ident now starts on the click rather than after the ~600ms stream request, and `OnionMark` processes its raster once per page instead of once per mount, which was stretching the ident past 5s on production |
| 2026-08-31 | — | `OnionMark` now lifts the bulb to its optical centre. The mark sits 8% low inside its own crop, so every lockup was centring an empty box and showing the mark below the text beside it |
| 2026-08-31 | — | Desktop/tablet intro mark enlarged, and its size now derives from the wordmark's viewport basis rather than fixed pixels — a fixed height made the mark 4.2x the letter height on tablet against 3.0x on desktop |
| 2026-08-31 | — | Wheel mark enlarged 152 → 210. The names' start position is now derived from the mark's width rather than hardcoded, so it could grow without sliding under them |
| 2026-08-31 | — | The brand wordmark is now one drawn asset used everywhere: extracted `OnionWordmark` from the intro geometry, rebuilt `OnionLogo` on it so the navbar and footer stop showing the raster's uppercase "ONION", and the wheel renders its own name as the wordmark while other platforms stay as type |
| 2026-08-31 | `93e472b` | The wheel's lockup now glides to the centre of the frame before the zoom, so the push travels through the logo instead of past the side of it. Applies to both the phone splash and the watch-page ident |
| 2026-08-31 | — | The wheel intro now plays as a brand ident inside the player before every video. `SplashWheel` gained `fullscreen` and `itemHeight` props so the same component serves the splash and the pre-roll |
| 2026-08-31 | — | Removed the click-to-enable-sound gate from the splash. On the live domain a first-time visitor got a black screen and a permission prompt; the intro now runs silently when autoplay is blocked |
| 2026-08-31 | — | Desktop splash: onion mark enlarged from 200 to 280 and the gap tightened, so it reads as the dominant element beside the wordmark rather than matching it |
| 2026-08-31 | — | **Live on Vercel.** Neon provisioned, schema migrated and catalog seeded, both projects deployed and wired. Verified end to end: health, catalog, home page and a cold `/watch/:id` deep link |
| 2026-08-31 | — | Deployment prep for Vercel + Neon: the Express app split from its listener, a serverless entry added, Prisma given a Linux binary target and a `directUrl` for pooled connections, CORS origins made env-driven, and `docs/deployment.md` written. **Not yet deployed — needs a Neon database** |
| 2026-08-31 | — | Plan 1.7: README rewritten to point at `docs/`, unused import dropped, and the stray `#7C3FC4` replaced with `colors.accent` via a new `withAlpha()` helper. **StudioPage still undecided (D3)** |
| 2026-08-31 | — | Plan 1.4 + 1.6: the hero shows the featured title's real description (fetched from `/titles/:id`, since the list projection omits it), and a failed catalog fetch now shows an error row with Retry instead of emptying the page |
| 2026-08-31 | — | Plan 1.5: CORS allowlist actually enforced outside development. Found and fixed alongside it: `dotenv.config()` ran after the imports that read `process.env`, so every key in `server/.env` was being silently ignored |
| 2026-08-31 | — | Plan 1.3: playback failures render in the player with a Retry button instead of firing `alert()`, and a failing `<video>` element is now surfaced too rather than leaving a silent black box |
| 2026-08-31 | — | Desktop/tablet intro replaced with a construction reveal: seed dots become the letterforms' anchor points, outlines draw between them over guides, then thicken into the solid wordmark and the mark joins. Wordmark is now hand-authored SVG geometry — Mr Bedfort and the old written-wordmark intro removed (recoverable from `3615d25`) |
| 2026-08-31 | — | Plan 1.2: the transport bar is now the real control surface — scrubber, duration, play/pause, mute and fullscreen all drive and follow the `<video>` element; the simulation is confined to the pre-play poster |
| 2026-08-31 | — | Splash breakpoint moved to 768px: tablets join desktop on the wordmark intro, leaving the wheel to phones |
| 2026-08-31 | — | Splash split by viewport: the original mark-swoop + written wordmark intro on the wider breakpoint, the wheel below it. `SplashIntro` is now a shell that picks a variant and owns the AudioContext; soundtracks moved to `components/splash/` so the component modules stay Fast-Refresh clean. Mr Bedfort restored to the font link for the desktop wordmark |
| 2026-08-31 | — | Splash finishes with a Netflix-style push: once the wheel lands, the mark drops in bigger (152px) on an overshoot curve, the losing platforms clear, and the lockup zooms 11x into the homepage. Spin shortened to 2000ms to keep the splash the same length |
| 2026-08-31 | — | The onion mark returns to the splash: once the wheel locks on Onion, the arrow marker crossfades into `OnionMark`, leaving a brand lockup. Spin shortened to 2200ms so the added beat does not lengthen the splash overall |
| 2026-08-31 | — | Splash replaced: the icon swoop and written wordmark were removed, and `PickerWheel` now spins through the platform list and locks on Onion. Audio retimed — ticks derived from the easing inverse, chime on the lock. Mr Bedfort dropped from the font link, now unused |
| 2026-08-31 | — | Added `PickerWheel` — a rotating slot-machine list of streaming platform names with arc geometry and depth-of-field falloff, plus a `/wheel` demo route |
| 2026-08-31 | — | Splash wordmark reset in Mr Bedfort script, lowercase, revealed by a nib sweeping the word left to right (single text run — a joined script cannot be split into per-letter spans); per-letter audio retimed to match |
| 2026-08-31 | — | Plan 1.1: splash `AudioContext` lifecycle fixed — single context per mount, closed on cleanup, resumed instead of re-created on the autoplay-blocked path |
| 2026-08-31 | `87ccc80` | Added the `docs/` suite: PRD, tech spec, app flow, design, schema, implementation plan, tracker, rules |
| 2026-08-31 | `525fc27` | Splash intro Web Audio soundtrack + autoplay overlay; `server/test-api.js` smoke test wired to `npm test` |
| — | `125d7f8` | Application features, services, styling and icons |
| — | `0f4f40b` | Netflix-style browsing UI; **sign-in system removed** |
| — | `b96537d` | Checkpoint before the UI overhaul |
| — | `3defc88` | First commit |
