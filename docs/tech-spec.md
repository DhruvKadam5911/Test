# Onion TV — Technical Specification

> **Status:** Living document. Last updated 2026-08-31.
> Update this file whenever the stack, architecture, config surface, or run procedure changes.

---

## 1. System shape

```
┌──────────────────────────┐        HTTP/JSON        ┌──────────────────────────┐
│  React SPA (Vite)        │  ────────────────────>  │  Express API             │
│  localhost:5173          │  <────────────────────  │  localhost:5000          │
│                          │                         │                          │
│  src/api/client.js       │                         │  routes → controllers    │
│  react-router-dom        │                         │  → Prisma → PostgreSQL   │
└──────────────────────────┘                         └───────────┬──────────────┘
         │                                                       │
         │ <video src>                                           │ resolvePlaybackUrl()
         ▼                                                       ▼
   Stream origin  <──────────────────────────────────  videoProvider.js
   (today: Google sample MP4s)                         (Cloudflare / JW Player — TODO)
```

Two independent processes. The frontend never talks to PostgreSQL; the backend never
serves the frontend build. There is no BFF, no SSR, no shared runtime.

---

## 2. Stack

### Frontend (repo root)

| Concern | Choice | Version |
|---------|--------|---------|
| Build tool | Vite | ^8.2.0 |
| Framework | React | ^19.2.8 |
| Router | react-router-dom | ^7.18.2 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/postcss`) + inline `style` objects | ^4.3.3 |
| Icons | lucide-react | ^1.28.0 |
| Language | Mixed — entry is `.tsx`, all components are `.jsx` | TypeScript ~6.0.2 |
| Lint | oxlint | ^1.75.0 |

**Note on the language mix:** only `src/main.tsx` and `vite.config.ts` are TypeScript.
Every component and page is plain JSX. `npm run build` runs `tsc -b` first, so any new
TypeScript must typecheck. New files should follow the existing `.jsx` convention unless
the whole codebase is migrated deliberately.

**Note on styling:** Tailwind utility classes and inline `style={{}}` objects are both used,
often on the same element. Colors come from `src/theme.js`, not from Tailwind's palette.
See [design.md](design.md).

### Backend (`server/`)

| Concern | Choice | Version |
|---------|--------|---------|
| Runtime | Node.js, ESM (`"type": "module"`) | — |
| HTTP | Express | ^4.21.2 |
| ORM | Prisma Client | ^6.3.0 |
| Database | PostgreSQL | — |
| CORS | cors | ^2.8.5 |
| Config | dotenv | ^16.4.7 |
| Dev reload | nodemon | ^3.1.9 |

---

## 3. Directory map

```
/
├── index.html                    App shell, favicons, Google Fonts, dark <html class="dark">
├── vite.config.ts                Dev server port (PORT env or 5173)
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.tsx                  ReactDOM root + StrictMode + BrowserRouter
│   ├── App.jsx                   Splash gate + <Routes>
│   ├── theme.js                  Design tokens + background resolution helpers
│   ├── index.css                 Tailwind entry
│   ├── api/client.js             fetch wrapper, error normalisation, API base URL
│   ├── data/videos.js            Legacy static data — only `gradients` is still used
│   ├── data/platforms.js         Streaming service names for the splash wheel and /wheel
│   ├── pages/
│   │   ├── Home.jsx              Hero, rows, search
│   │   ├── WatchPage.jsx         Player, metadata, episodes/recommendations overlay
│   │   ├── StudioPage.jsx        Upload mock — NOT ROUTED
│   │   └── WheelDemo.jsx         PickerWheel demo at /wheel — not linked from the app
│   ├── components/
│   │   ├── SplashIntro.jsx       Picks an intro by viewport; owns the AudioContext
│   │   ├── SplashWheel.jsx       Mobile/tablet intro — wheel, lock, push through logo
│   │   ├── SplashConstruct.jsx   Tablet/desktop intro — wordmark built from dots
│   │   ├── splash/               Wordmark geometry, timings, soundtracks per variant
│   │   ├── PickerWheel.jsx       Rotating slot-machine list (loop or settle mode)
│   │   ├── AppNavbar.jsx         Logo, links, expanding search, bell
│   │   ├── ContentRow.jsx        Horizontal scroller with arrows, skeletons, retry
│   │   ├── ContentCard.jsx       Card + CardSkeleton export
│   │   └── shared/               OnionLogo, OnionMark, RingMotif, SmallRing
│   └── assets/
└── server/
    ├── app.js                    The Express app — CORS, /, /health, routes, 404, errors
    ├── server.js                 Local listener only; Vercel does not use it
    ├── api/index.js              Vercel serverless entry, re-exports the app
    ├── vercel.json               Routes every path to the function
    ├── test-api.js               Endpoint smoke test (`npm test`)
    ├── .env / .env.example
    ├── prisma/
    │   ├── schema.prisma         6 models — see schema.md
    │   ├── seed.js               3 titles (1 series with 2 episodes, 2 movies)
    │   └── migrations/           20260801204021_init
    └── src/
        ├── config/db.js          Single shared PrismaClient
        ├── routes/titles.js      Router for /titles
        ├── controllers/titlesController.js
        └── services/
            ├── videoProvider.js  Playback URL resolution — provider TODOs
            └── tmdb.js           Metadata client — TODOs
```

---

## 4. Configuration

### Frontend

| Var | Default | Purpose |
|-----|---------|---------|
| `VITE_API_URL` | `http://localhost:5000` | Backend base URL (`src/api/client.js:1`) |
| `PORT` | `5173` | Vite dev server port (`vite.config.ts`) |

### Backend (`server/.env` — gitignored, template in `server/.env.example`)

`server.js` loads these with `import "dotenv/config"` as its **first** import. That ordering is
load-bearing: the service modules read `process.env` at their top level, and ESM evaluates every
import before the importing module's body, so a `dotenv.config()` call in the body runs too late
and leaves them all reading `undefined`.

| Var | Required | Purpose |
|-----|----------|---------|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `PORT` | no | Defaults to 5000 |
| `JWT_SECRET` | no | Reserved for auth; nothing reads it yet |
| `TMDB_API_KEY` / `TMDB_BASE_URL` | no | Enables `tmdb.js` once implemented |
| `VIDEO_PROVIDER` | no | `cloudflare` or `jwplayer`. **Blank = pass the DB `playbackUrl` through unchanged.** Setting it without implementing the provider block throws on every playback request |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_STREAM_API_TOKEN` | no | For `VIDEO_PROVIDER=cloudflare` |
| `JWPLAYER_API_KEY` / `JWPLAYER_API_SECRET` | no | For `VIDEO_PROVIDER=jwplayer` |

---

## 5. Running locally

Both processes must run. Start the backend first — the frontend's first paint depends on it.

**1. Backend**

```bash
cd server && npm install && npx prisma generate && npx prisma migrate dev && node prisma/seed.js && npm run dev
```

Expect: `🚀 Onion VOD server running on http://localhost:5000`

**2. Frontend** (separate terminal, from the repo root)

```bash
npm install && npm run dev
```

Expect: Vite on `http://localhost:5173`.

**3. Verify**

```bash
cd server && npm test
```

Expect all five checks green, ending in `🎉 All tests passed successfully!`

### Other commands

| Command | Where | Does |
|---------|-------|------|
| `npm run build` | root | `tsc -b && vite build` → `dist/` |
| `npm run preview` | root | Serve the production build |
| `npm run lint` | root | oxlint |
| `npm start` | server | `node server.js` (no reload) |
| `npm run prisma:generate` | server | Regenerate Prisma Client after schema edits |
| `npm run prisma:migrate` | server | Create and apply a dev migration |

---

## 6. Key design decisions and their rationale

| Decision | Rationale | Consequence |
|----------|-----------|-------------|
| Playback URL behind its own endpoint | Keeps stream URLs out of the browsable catalog | `getTitleById` strips `playbackUrl`; episodes omit it from their `select` |
| `videoProvider.js` indirection | Provider swap without touching controllers | Controllers only ever call `resolvePlaybackUrl(storedUrl)` |
| Genre rows derived at runtime | New catalog genres need no code change | Home fetches `?limit=100` and groups client-side |
| Single shared `PrismaClient` | Avoids connection-pool exhaustion | Always import `src/config/db.js`, never `new PrismaClient()` |
| Design tokens in `theme.js` | One source of truth for brand colors | Do not hardcode hex values in components |
| CORS allowlist enforced only outside development | Local tooling on arbitrary ports stays usable while production is closed | Unlisted origins are warned about and allowed when `NODE_ENV !== "production"`, and refused by withholding the header otherwise |
| Splash gated on `App` state, not a route | Intro plays once per session, not per navigation | `showSplash` lives in `App.jsx` |
| The splash exit is driven by `PickerWheel`'s `onSettled`, not a timer | The fade can never start before the wheel has landed | Changing `SPIN_MS` needs no change to the exit timings |
| `thumbnailUrl` / `heroImageUrl` accept a CSS gradient *or* an image URL | Ships without real artwork | Always render them through `resolveBackground()` / `resolveBackgroundImage()` |

---

## 7. Known technical debt

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| T8 | Search filters only the loaded pool (`?limit=100`), not the server | `Home.jsx` | Silently incomplete past 100 titles |
| T9 | No auth on `/titles/:id/playback` despite the "(Requires Auth)" comment | `titlesController.js` | Stream URLs are public |
| T10 | Mixed `.tsx`/`.jsx` with `tsc -b` in the build | root | Build can fail on TS errors in a mostly-JS codebase |

**Resolved 2026-08-31:** T1 (splash `AudioContext` lifecycle), T2 (decorative CORS allowlist),
T3 (hardcoded hero description), T4 (simulated scrubber), T5 (`alert()` for playback errors),
T6 (unused import), T7 (Vite-template README) — see implementation-plan.md 1.1–1.7. Also fixed
along the way: `dotenv.config()` ran after the imports that read `process.env`, so **every key
in `server/.env` was silently ignored** by the service modules.

Fixes are sequenced in [implementation-plan.md](implementation-plan.md); status lives in [tracker.md](tracker.md).
