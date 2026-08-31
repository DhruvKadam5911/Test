# Onion TV — read this before writing any code

**Onion TV** is a VOD streaming web app: a React 19 + Vite SPA (port 5173) talking to a
Node/Express + Prisma + PostgreSQL API (port 5000). Both processes must run.

## Mandatory reading order

Before you change **any** file in this repository, read:

1. **[docs/rules.md](docs/rules.md)** — the binding engineering rules. Start here.
2. **[docs/tracker.md](docs/tracker.md)** — current status: what works, what is simulated, what is broken, and the hazard list.
3. **[docs/implementation-plan.md](docs/implementation-plan.md)** — whether your task is already sequenced and what it depends on.

Then the document covering your area:

| Area | Document |
|------|----------|
| Product scope, goals, non-goals | [docs/PRD.md](docs/PRD.md) |
| Architecture, stack, env vars, how to run it | [docs/tech-spec.md](docs/tech-spec.md) |
| Routes, screens, fetch sequences, navigation | [docs/appflow.md](docs/appflow.md) |
| Colors, typography, motion, styling conventions | [docs/design.md](docs/design.md) |
| Prisma models, API contract, seed data, migrations | [docs/schema.md](docs/schema.md) |

**The code is the source of truth.** If a document disagrees with the code, the code wins and
the document is a bug — fix it in the same commit.

## Keep the documents alive

Every commit that changes behaviour updates the documents it affects, and always updates
`docs/tracker.md` (status + changelog). The mapping table is in
[docs/rules.md](docs/rules.md) §1. Work is not done until the docs match the code.

## The seven non-negotiables

Full detail in [docs/rules.md](docs/rules.md) §2. In short:

1. `playbackUrl` never appears in a list or detail response — only `/titles/:id/playback` returns it.
2. Never `new PrismaClient()` — import the shared client from `server/src/config/db.js`.
3. `server/prisma/seed.js` **deletes all six tables** before inserting. Never run it against real data.
4. In `server/src/routes/titles.js`, `/trending` must stay declared above `/:id`.
5. Every error response keeps the `error` key — `src/api/client.js` depends on it.
6. `/titles` and `/titles/trending` must return the identical projection.
7. Never set `VIDEO_PROVIDER` without implementing its branch — both currently throw.

## Running it

```bash
cd server && npm install && npx prisma generate && npx prisma migrate dev && node prisma/seed.js && npm run dev
```

```bash
npm install && npm run dev
```

## Verify before saying it works

```bash
cd server && npm test
```

Then `npm run lint && npm run build` at the root, and click through the actual flow in the
browser with the console open. Never report work as complete on the strength of the diff alone.
