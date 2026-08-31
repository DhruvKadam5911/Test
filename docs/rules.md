# Onion TV — Engineering Rules

> **Binding on every contributor, human or AI.** Last updated 2026-08-31.
> If a rule here is wrong, change the rule in the same commit as the code — do not quietly ignore it.

---

## 0. Before you change anything

Read, in this order:

1. **[tracker.md](tracker.md)** — what is real, what is simulated, what is broken. Start here every time.
2. **[implementation-plan.md](implementation-plan.md)** — whether your task is already sequenced, and what it depends on.
3. The document covering your area:
   - Product / scope → [PRD.md](PRD.md)
   - Architecture, config, running it → [tech-spec.md](tech-spec.md)
   - Routes, screens, fetch order → [appflow.md](appflow.md)
   - Colors, type, motion → [design.md](design.md)
   - Models, endpoints, contracts → [schema.md](schema.md)

Then read the actual source file. **These documents describe the code; the code is the truth.**
If they disagree, the code wins and the document is a bug — fix it.

---

## 1. Keep the documents alive

The same commit that changes behaviour updates the documents it affects.

| If you change… | Update |
|----------------|--------|
| A route, screen, or fetch sequence | `appflow.md` |
| A Prisma model or migration | `schema.md` (+ `seed.js` if fields became required) |
| An endpoint, its params, or its response | `schema.md` + add a case to `server/test-api.js` |
| A design token, font, or motion timing | `design.md` |
| Stack, dependency, env var, or run command | `tech-spec.md` |
| Product scope or priorities | `PRD.md` |
| **Anything at all** | `tracker.md` — status and changelog |

Finishing a plan item means ticking it in `tracker.md`, not just landing the code.

---

## 2. Non-negotiables

These break the product or leak data if violated.

1. **`playbackUrl` never appears in a list or detail response.** `getTitleById` strips the
   title's own URL and excludes episodes' from the `select`. `/titles/:id/playback` is the only
   source. Adding it to a `select` is a security regression, not a convenience.
2. **Never `new PrismaClient()`.** Import the shared instance from `server/src/config/db.js`.
   Extra clients exhaust the connection pool.
3. **Never run `node prisma/seed.js` against a database with real data.** It deletes all six
   tables first.
4. **`/trending` stays declared above `/:id`** in `server/src/routes/titles.js`. Any static path
   added after `/:id` will be swallowed as an id.
5. **Every error response keeps the `error` key.** `src/api/client.js` reads `data.error`;
   renaming it degrades every message in the UI to a generic string.
6. **`/titles` and `/titles/trending` return the identical projection.** `ContentCard` consumes
   both. Diverging them breaks one of the two silently.
7. **Never set `VIDEO_PROVIDER` without implementing its branch.** Both currently throw, which
   takes down all playback.

---

## 3. Frontend rules

1. **Colors come from `src/theme.js`.** Import `colors`; never paste a hex value. The palette is
   not in the Tailwind config, which is why inline styles carry the colors.
2. **Match the file's existing styling mix** — Tailwind for layout, inline `style={{}}` for
   token-driven values. Do not introduce a third styling system.
3. **Render `thumbnailUrl` / `heroImageUrl` through `resolveBackground()` or
   `resolveBackgroundImage()`.** They hold either a CSS gradient or an image URL. Writing
   `url(${value})` directly breaks every gradient-backed title — currently all of them.
4. **New components are `.jsx`**, matching the codebase. Only `main.tsx` and `vite.config.ts` are
   TypeScript. `npm run build` runs `tsc -b`, so any TypeScript you add must typecheck.
5. **Every async render path needs three states** — loading skeleton, error with retry, empty.
   Copy the pattern in `ContentRow.jsx`. Silent failure is a bug (see hazard H2).
6. **No `alert()`, `confirm()`, or `prompt()`.** Render errors in the UI.
7. **Do not read from `src/data/videos.js`** except `gradients`. Everything else there is an
   empty legacy export.
8. **Keep `ContentCard` and `CardSkeleton` dimensions in sync** — `lg` 260×146, `md` 200×112.
9. **Effects that create resources must clean them up** — `AudioContext`, intervals, listeners.
   StrictMode double-invokes effects in dev; write them to survive that.

---

## 4. Backend rules

1. **Layering:** `routes/` declares paths only → `controllers/` holds request logic → `services/`
   holds external integrations. Do not query Prisma from a route or call `fetch` from a controller.
2. **Every controller wraps its body in try/catch** and returns `{ error: "…" }` with a real
   status code. Log with `console.error("<fnName> error:", error)` — match the existing format.
3. **List endpoints return a projection, not the row.** Use `select`, and think about what you
   are exposing.
4. **New external integrations go in `services/`** behind a function the controller calls, with
   the same shape as `videoProvider.js`: read config, return a safe default when unconfigured,
   throw a message naming the missing env var when half-configured.
5. **Every new endpoint gets a case in `server/test-api.js`**, and `npm test` must pass before
   you call the work done.
6. **Secrets live in `server/.env`** (gitignored) and are mirrored — keys only, no values — into
   `server/.env.example`.

---

## 5. Database rules

1. Schema change → `npm run prisma:migrate` → `npm run prisma:generate` → update `schema.md`.
2. Never hand-edit an applied migration.
3. New required field on an existing model → update `seed.js` in the same commit or seeding breaks.
4. Cascade deletes are intentional. Preserve them when adding relations.

---

## 6. Verification before declaring done

Never report work as complete on the strength of the diff alone.

```bash
cd server && npm test
```

```bash
npm run lint && npm run build
```

Plus, for anything user-facing: run both servers, load the page, click through the actual flow,
and check the browser console for errors. If a check fails, say so with the output — do not
describe partial work as finished.

---

## 7. Git

- Commit messages: imperative subject line, body explaining *why*.
- Do not commit `.env`, `dist/`, or `node_modules/`.
- Do not push unless asked.
- Do not commit unrelated changes together.

---

## 8. Scope

- Build what was asked. Do not silently widen or narrow it.
- Found an unrelated problem? Add it to `tracker.md` and mention it. Do not fix it in the same commit.
- Do not delete code that looks unused without checking `tracker.md` — some of it is documented
  dead code awaiting a decision (`data/videos.js`, the Fraunces font).
- Do not add a dependency without noting it in `tech-spec.md` §2.
