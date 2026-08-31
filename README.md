# Onion TV

A video-on-demand streaming web app: a React SPA browsing a catalog served by a
Node/Express + Prisma + PostgreSQL API.

## Before you change anything

**Read [CLAUDE.md](CLAUDE.md) first**, then the documents it points to under [`docs/`](docs/).
They cover what works, what is deliberately unfinished, and the rules for changing it — including
several things that look like bugs but are not, and one script that deletes your database.

| Document | Covers |
|----------|--------|
| [docs/rules.md](docs/rules.md) | Engineering rules. Start here |
| [docs/tracker.md](docs/tracker.md) | Current status, hazards, open decisions |
| [docs/implementation-plan.md](docs/implementation-plan.md) | What to build next, in order |
| [docs/PRD.md](docs/PRD.md) | Product scope, goals, non-goals |
| [docs/tech-spec.md](docs/tech-spec.md) | Architecture, stack, config, commands |
| [docs/appflow.md](docs/appflow.md) | Routes, screens, fetch sequences |
| [docs/design.md](docs/design.md) | Design tokens, typography, motion |
| [docs/schema.md](docs/schema.md) | Data model and API contract |
| [docs/deployment.md](docs/deployment.md) | Hosting on Vercel + Neon |

## Running it

Both processes must run. Start the backend first — the frontend's first paint depends on it.

**Backend** (needs a PostgreSQL database and a `server/.env`, see `server/.env.example`):

```bash
cd server && npm install && npx prisma generate && npx prisma migrate dev && node prisma/seed.js && npm run dev
```

> `prisma/seed.js` **deletes every row in all six tables** before inserting. Never run it against
> data you care about.

**Frontend**, from the repo root:

```bash
npm install && npm run dev
```

The app is then on http://localhost:5173, the API on http://localhost:5000.

## Checks

```bash
cd server && npm test
```

```bash
npm run lint && npm run build
```

## Stack

React 19 · Vite 8 · react-router-dom 7 · Tailwind CSS v4 · Express 4 · Prisma 6 · PostgreSQL
