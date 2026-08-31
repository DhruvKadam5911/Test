# Onion TV — Status Tracker

> **Update this file in the same commit as the work it describes.** It is the fastest way for
> anyone — human or AI — to know what is real, what is fake, and what is broken.
> Last updated 2026-08-31.

---

## Snapshot

| | |
|---|---|
| **Branch** | `main` |
| **Last commit** | `87ccc80` — Add the project documentation suite |
| **Unpushed** | Yes — everything since `125d7f8` is local only |
| **Frontend** | ✅ Runs, Vite 8.2.0 on :5173 |
| **Backend** | ✅ Runs on :5000, database healthy |
| **Smoke test** | ✅ All 5 checks pass |
| **Catalog** | 3 seeded titles |
| **Current phase** | Phase 1 — Stabilise (1.1–1.3 done; 1.4–1.7 open) |

---

## Feature status

Legend: ✅ working · 🟡 partial or simulated · ⛔ not built · 🗑️ dead code

### Frontend

| Feature | Status | Notes |
|---------|--------|-------|
| Splash intro visuals | ✅ | Two variants by viewport. **Tablet & desktop (≥768px):** the wordmark is constructed — dots → anchor points → drawn outlines → solid, then the mark joins, ~3.2s. **Phone (<768px):** wheel spins through platforms, locks on Onion, mark drops in, others clear, lockup pushes through into the app, ~3.5s |
| Splash intro audio | ✅ | One `AudioContext` per mount, closed on unmount; the click path resumes it rather than opening a second (plan 1.1, 2026-08-31) |
| Autoplay-blocked overlay | ✅ | Click-to-enable |
| Cinematic hero | 🟡 | Renders, but the truncated description is hardcoded *Undertow* copy — plan 1.4 |
| Trending row | ✅ | With skeleton + retry |
| Onion Originals row | ✅ | Client-side `isOriginal` filter |
| Dynamic genre rows | ✅ | Derived from the catalog at runtime |
| Search | 🟡 | Client-side over the loaded 100-title pool only — plan 5.1 |
| Content cards + skeletons | ✅ | |
| PickerWheel | ✅ | Reusable rotating-list component. Loop mode demoed at `/wheel`; settle mode drives the splash |
| Row arrows / scroll | ✅ | |
| Watch page metadata | ✅ | |
| Season / episode picker | ✅ | |
| More Like This | ✅ | Same-genre recommendations |
| Video playback | ✅ | HTML5 `<video>`, MP4 only. Native controls off — the custom bar drives play/pause, seek, mute and fullscreen |
| Scrubber | ✅ | Bound to the element via `timeupdate` / `loadedmetadata`; dragging seeks, and duration comes from the video (plan 1.2, 2026-08-31) |
| Playback error UX | ✅ | In-player message + Retry, covering both a failed request and a failed `<video>` element (plan 1.3, 2026-08-31) |
| Pool-fetch error UX | ⛔ | Fails silently, rows just vanish — plan 1.6 |
| 404 route | ⛔ | Unmatched paths render blank |
| Creator Studio | 🗑️ | `StudioPage.jsx` — simulated upload, not routed |
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
| CORS allowlist | 🟡 | Built but bypassed — every origin allowed — plan 1.5 |
| 404 + error handlers | ✅ | |
| Video provider | ⛔ | Both branches throw; pass-through only — Phase 2 |
| TMDB service | ⛔ | Both functions throw — plan 5.4 |
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
| H2 | `fetchPool()` failures are console-only; the UI shows no error, rows simply disappear |
| H3 | The scrubber is real during playback, but falls back to a `setInterval` preview *before* a stream is fetched. That preview timer is gated on `!playbackUrl` — never let it run alongside the element |
| H3b | Google's `gtv-videos-bucket` sample URLs in the seed data return **403** from some networks. If playback fails with `MEDIA_ELEMENT_ERROR`, check the network before suspecting the player |
| H4 | `data/videos.js` is legacy — `videos`, `heroVideo`, `continueWatching`, `trending` are all empty. Only `gradients` is live. Do not read data from it |
| H5 | `StudioPage.jsx` looks like a feature but is unrouted and simulated |
| H6 | Setting `VIDEO_PROVIDER` in `.env` without implementing the branch breaks **all** playback |
| H7 | Route order in `routes/titles.js` — `/trending` must stay above `/:id` |
| H8 | `npm run build` runs `tsc -b`. TypeScript errors fail a build in a mostly-JSX codebase |
| H9 | `#7C3FC4` appears in a few places instead of `colors.accent` `#7B2685` |
| H10 | Two components render the same raster differently: `OnionLogo.jsx` draws the full lockup for the navbar/footer, `OnionMark.jsx` crops the bulb alone for the splash. Both re-process `public/logo.png` on a canvas at runtime — if that file is replaced, check the crop bounds and the white-knockout threshold in both |
| H10b | The desktop wordmark is hand-authored SVG geometry in `splash/wordmarkGeometry.js`, **not** a font. Changing the wordmark means editing paths and their anchor lists together — the anchors are drawn from the same file so they cannot drift, but only if you edit both |
| H11a | The splash breakpoint is read once at mount and never re-read. That is intentional — do not "fix" it with a resize listener, or a resize will swap the intro mid-animation |
| H11 | `PickerWheel` writes styles straight to DOM nodes from a rAF loop. Do not also drive those same properties from React state or CSS transitions — they will fight each other. `isolate` is safe only because it runs after the loop has finished |

---

## Technical debt

Detailed in [tech-spec.md](tech-spec.md) §7. Originally T1–T10; **T1, T4 and T5 resolved 2026-08-31**, seven open.

---

## Open decisions

| # | Question | Blocks |
|---|----------|--------|
| D1 | Cloudflare Stream or JW Player? | All of Phase 2 |
| D2 | Does v1 need accounts? | Phase 3, therefore Phase 4 |
| D3 | Keep or delete Creator Studio? | Plan 1.7 |
| D4 | Where does catalog content come from — manual, TMDB, or uploads? | Phase 5 |
| D5 | Is Fraunces (loaded, unused) part of the type system or should it be dropped? | design.md |
| D6 | Should a wordmark join the mark once the wheel lands, or is the mark beside "Onion" enough? | Splash branding |

---

## Changelog

| Date | Commit | Change |
|------|--------|--------|
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
