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
| **Current phase** | Phase 1 — Stabilise (1.1 done; 1.2–1.7 open) |

---

## Feature status

Legend: ✅ working · 🟡 partial or simulated · ⛔ not built · 🗑️ dead code

### Frontend

| Feature | Status | Notes |
|---------|--------|-------|
| Splash intro visuals | ✅ | 3.1s timeline |
| Splash intro audio | ✅ | One `AudioContext` per mount, closed on unmount; the click path resumes it rather than opening a second (plan 1.1, 2026-08-31) |
| Autoplay-blocked overlay | ✅ | Click-to-enable |
| Cinematic hero | 🟡 | Renders, but the truncated description is hardcoded *Undertow* copy — plan 1.4 |
| Trending row | ✅ | With skeleton + retry |
| Onion Originals row | ✅ | Client-side `isOriginal` filter |
| Dynamic genre rows | ✅ | Derived from the catalog at runtime |
| Search | 🟡 | Client-side over the loaded 100-title pool only — plan 5.1 |
| Content cards + skeletons | ✅ | |
| Row arrows / scroll | ✅ | |
| Watch page metadata | ✅ | |
| Season / episode picker | ✅ | |
| More Like This | ✅ | Same-genre recommendations |
| Video playback | ✅ | HTML5 `<video>`, MP4 only |
| Scrubber | 🟡 | `setInterval` simulation, not bound to the video — plan 1.2 |
| Playback error UX | 🟡 | Browser `alert()` — plan 1.3 |
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
| H3 | The scrubber time is fake. Do not build watch-progress persistence on it before plan 1.2 |
| H4 | `data/videos.js` is legacy — `videos`, `heroVideo`, `continueWatching`, `trending` are all empty. Only `gradients` is live. Do not read data from it |
| H5 | `StudioPage.jsx` looks like a feature but is unrouted and simulated |
| H6 | Setting `VIDEO_PROVIDER` in `.env` without implementing the branch breaks **all** playback |
| H7 | Route order in `routes/titles.js` — `/trending` must stay above `/:id` |
| H8 | `npm run build` runs `tsc -b`. TypeScript errors fail a build in a mostly-JSX codebase |
| H9 | `#7C3FC4` appears in a few places instead of `colors.accent` `#7B2685` |

---

## Technical debt

Detailed in [tech-spec.md](tech-spec.md) §7. Originally T1–T10; **T1 resolved 2026-08-31**, nine open.

---

## Open decisions

| # | Question | Blocks |
|---|----------|--------|
| D1 | Cloudflare Stream or JW Player? | All of Phase 2 |
| D2 | Does v1 need accounts? | Phase 3, therefore Phase 4 |
| D3 | Keep or delete Creator Studio? | Plan 1.7 |
| D4 | Where does catalog content come from — manual, TMDB, or uploads? | Phase 5 |
| D5 | Is Fraunces (loaded, unused) part of the type system or should it be dropped? | design.md |

---

## Changelog

| Date | Commit | Change |
|------|--------|--------|
| 2026-08-31 | — | Plan 1.1: splash `AudioContext` lifecycle fixed — single context per mount, closed on cleanup, resumed instead of re-created on the autoplay-blocked path |
| 2026-08-31 | `87ccc80` | Added the `docs/` suite: PRD, tech spec, app flow, design, schema, implementation plan, tracker, rules |
| 2026-08-31 | `525fc27` | Splash intro Web Audio soundtrack + autoplay overlay; `server/test-api.js` smoke test wired to `npm test` |
| — | `125d7f8` | Application features, services, styling and icons |
| — | `0f4f40b` | Netflix-style browsing UI; **sign-in system removed** |
| — | `b96537d` | Checkpoint before the UI overhaul |
| — | `3defc88` | First commit |
