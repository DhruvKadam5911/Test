# Onion TV — Product Requirements Document

> **Status:** Living document. Last updated 2026-08-31.
> Update this file whenever product scope, user-facing behaviour, or priorities change.

---

## 1. Product summary

**Onion TV** is a video-on-demand (VOD) streaming web app — a Netflix-style browse-and-watch
experience for a curated catalog of movies and series. The catalog lives in a PostgreSQL
database behind a Node/Express API; the frontend is a React SPA.

**One-line pitch:** a self-hosted streaming front door for an independent content catalog,
with a distinctive purple/onion brand identity.

**Current stage:** working MVP. Catalog browse, search, title detail and playback all work
end-to-end against real data. Accounts, watch history and My List exist in the database schema
but have no API or UI yet.

---

## 2. Goals and non-goals

### Goals (what this product is for)

| # | Goal | Why |
|---|------|-----|
| G1 | Let a visitor discover titles without friction | No login wall — the catalog is browsable immediately |
| G2 | Make the catalog feel alive and editorial | Hero feature, trending row, dynamic genre rows |
| G3 | Play a title reliably | One click from card → player, HLS/MP4 stream resolves server-side |
| G4 | Keep stream URLs off the public catalog response | Playback URL is issued only from a dedicated endpoint |
| G5 | Stay provider-agnostic for video hosting | Swap Cloudflare Stream / JW Player without touching controllers |
| G6 | Ship a memorable first impression | Animated splash intro with synthesized audio |

### Non-goals (explicitly out of scope right now)

- Live/linear TV, live events, or real-time chat.
- Payments, subscriptions, paywalls or entitlements.
- DRM (Widevine/FairPlay). Streams are currently unprotected URLs.
- Social features — comments, ratings, sharing, profiles.
- Mobile native apps. The web app is responsive; that is the whole mobile story.
- Content moderation or user-generated uploads. There is no upload path in the product.

---

## 3. Users

| Persona | Needs | Currently served? |
|---------|-------|-------------------|
| **Viewer** (primary) | Browse, search, pick something, watch it | ✅ Yes |
| **Returning viewer** | Resume where they left off, keep a watchlist | ❌ Schema exists, no API/UI |
| **Creator / uploader** | Upload and manage their own titles | ❌ Not a persona this product serves — uploads are a non-goal (D3, decided 2026-08-31) |
| **Operator / admin** | Add and edit catalog entries | ❌ Currently done by editing `server/prisma/seed.js` |

---

## 4. Feature inventory

### 4.1 Shipped

| Feature | Where | Notes |
|---------|-------|-------|
| Splash intro | `src/components/SplashIntro.jsx` | Picks an intro by viewport and owns the audio. Sound plays only if the browser allows it; the animation never waits on it |
| Cinematic hero | `src/pages/Home.jsx` | Driven by the first trending title; gradient scrims, ring motif |
| Trending row | Home | `GET /titles/trending`, ranked, with retry on failure |
| Onion Originals row | Home | Filtered client-side on `isOriginal` |
| Dynamic genre rows | Home | Genres derived from the catalog at runtime — new genres appear automatically, sorted by title count |
| Search | `AppNavbar` → Home | Client-side filter over the loaded title pool; matches title and genre |
| Title detail + player | `src/pages/WatchPage.jsx` | Metadata, recommendations by genre, HTML5 `<video>` once a playback URL is fetched |
| Season/episode picker | WatchPage overlay | Season `<select>` + episode list for series |
| "More Like This" | WatchPage overlay | For movies, same-genre recommendations |
| Loading & error states | ContentRow, ContentCard, Home, WatchPage | Skeletons + retry buttons |
| API smoke test | `server/test-api.js` | `npm test` in `server/` — walks every live endpoint |

### 4.2 Designed but not built

| Feature | Blocking |
|---------|----------|
| Accounts / auth | `User` model + `JWT_SECRET` exist; no routes, no middleware, no UI |
| Continue watching | `WatchProgress` model exists; nothing writes to it. Player time is simulated, not persisted |
| My List | `MyListItem` model exists; no endpoints, no UI |
| Real video provider | `videoProvider.js` throws for both `cloudflare` and `jwplayer` — TODOs only |
| TMDB metadata enrichment | `tmdb.js` throws — TODOs only |
| ~~Creator Studio~~ | Removed. It simulated an upload with a timer against no backend; see D3 |

---

## 5. Success criteria for the current milestone

1. A cold visitor lands on `/`, sees the splash, and reaches a populated home page in under 3s on a local dev machine.
2. Every row either renders content, a skeleton, or an actionable error with retry — never a blank gap.
3. Clicking any card reaches `/watch/:id` and the play button yields a playing video.
4. `npm test` in `server/` passes all five endpoint checks against a seeded database.
5. No console errors on the happy path.

---

## 6. Open product questions

- Does Onion need accounts at all for v1, or is anonymous browsing the product?
- Which video provider are we committing to? This unblocks G5 and real playback at scale.
- Where does catalog content come from — manual curation, TMDB import, or creator uploads?

---

## 7. Related documents

- [tech-spec.md](tech-spec.md) — architecture and stack
- [appflow.md](appflow.md) — screen-by-screen user journeys
- [design.md](design.md) — visual language and design tokens
- [schema.md](schema.md) — data model and API contract
- [implementation-plan.md](implementation-plan.md) — what to build next, in order
- [tracker.md](tracker.md) — current status of every workstream
- [rules.md](rules.md) — engineering rules any contributor must follow
