# Onion TV — Deployment (Vercel + Neon)

> **Status:** Living document. Last updated 2026-08-31.
> Update this file whenever the hosting shape, env vars, or deploy steps change.

---

## 1. Shape

**Two Vercel projects from one repository.** The frontend and the API have separate
`package.json` files and separate dependency trees, so a single project would have to install
both to build either.

| Project | Root directory | Live at | Serves |
|---------|----------------|---------|--------|
| `onion-tv` | *(repo root)* | https://onion-tv.vercel.app | The SPA — static build in `dist/` |
| `onion-tv-api` | `server` | https://onion-tv-api.vercel.app | The Express app as one serverless function |

Both are deployed under the `sudospades-projects` Vercel scope.

The database is **Neon** (managed Postgres). Vercel functions cannot reach a local Postgres, so
`DATABASE_URL` must point at Neon, not `localhost`.

```
Browser ──► onion-tv.vercel.app        (static SPA)          ✅ live
                 │ VITE_API_URL
                 ▼
            onion-tv-api.vercel.app    (serverless Express)  ✅ live
                 │ DATABASE_URL (pooled)
                 ▼
              Neon Postgres                                  ❌ not provisioned
```

**Current state:** both projects are deployed and wired to each other. `VITE_API_URL`,
`CORS_ORIGINS` and `JWT_SECRET` are set. The only thing missing is the database — until
`DATABASE_URL` and `DIRECT_URL` are set on the API project, `/health` returns 500 and the site
renders its "Couldn't load…" row.

---

## 2. What makes this work

Four things had to change for serverless, and each will break the deployment if undone:

| Change | Why |
|--------|-----|
| `server/app.js` exports the app; `server/server.js` only listens | Vercel invokes a handler per request. A process that binds a port never becomes ready |
| `server/api/index.js` re-exports the app | Vercel's Node runtime looks for functions under `api/` |
| `binaryTargets = ["native", "rhel-openssl-3.0.x"]` in `schema.prisma` | The function runs on Linux. A client generated only for the dev machine has no engine it can load |
| `directUrl` in `schema.prisma` | Queries go through Neon's pooler; migrations cannot run over a pooler and need the direct host |

`postinstall: prisma generate` in `server/package.json` makes sure the client is regenerated in
the build container rather than restored from a cached `node_modules`.

**The CORS allowlist is enforced when `NODE_ENV=production`,** which Vercel sets automatically.
The deployed frontend's domain must be in `CORS_ORIGINS` or the app is blocked from its own API —
this is the single most likely cause of "it works locally but the deployed site is empty".

---

## 3. Environment variables

### `onion-tv-api` (the `server` project)

| Var | Value |
|-----|-------|
| `DATABASE_URL` | Neon **pooled** connection string — host contains `-pooler` |
| `DIRECT_URL` | Neon **direct** connection string |
| `CORS_ORIGINS` | The frontend's deployed origin, e.g. `https://onion-tv.vercel.app`. Comma separated for more |
| `JWT_SECRET` | Any long random string. Reserved; nothing reads it yet |

`NODE_ENV` is set to `production` by Vercel — do not set it by hand.

### `onion-tv` (the frontend project)

| Var | Value |
|-----|-------|
| `VITE_API_URL` | The API's deployed origin, e.g. `https://onion-tv-api.vercel.app` |

Vite inlines `VITE_*` at build time, so **changing this requires a redeploy**, not just a restart.

---

## 4. Finishing the deploy

Steps 3–5 below are already done. What remains is 1 and 2.

1. **Create the Neon project** at [neon.tech](https://neon.tech) and copy both connection
   strings (pooled and direct) from its dashboard.

2. **Apply the schema and seed the catalog**, from `server/`:

   ```bash
   DATABASE_URL="<neon-pooled>" DIRECT_URL="<neon-direct>" npx prisma migrate deploy
   ```

   ```bash
   DATABASE_URL="<neon-pooled>" DIRECT_URL="<neon-direct>" node prisma/seed.js
   ```

   > `seed.js` **deletes every row in all six tables** before inserting. Only ever run it
   > against a database whose contents you are willing to lose.

3. **Set the two database variables** on the API project, from `server/`:

   ```bash
   printf '<neon-pooled>' | npx vercel env add DATABASE_URL production
   ```

   ```bash
   printf '<neon-direct>' | npx vercel env add DIRECT_URL production
   ```

   Then redeploy so the function picks them up: `npx vercel deploy --prod --yes`.

4. ~~Deploy the frontend with `VITE_API_URL`~~ — done. Note Vite inlines the value at build
   time, so pointing at a different API means a rebuild, not just an env change.

5. ~~Set `CORS_ORIGINS` on the API~~ — done, and verified: the frontend's origin receives
   `Access-Control-Allow-Origin`, an unlisted origin receives none.

---

## 5. Verifying a deploy

```bash
curl -s https://<api-domain>/health
```

Expect `{"status":"ok","message":"Onion VOD server & database healthy"}`. A `500` here means the
function reached but the database did not — check `DATABASE_URL`.

Then open the frontend and confirm the rows populate. If the page loads but every row shows
"Couldn't load…", open the browser console: a CORS message means `CORS_ORIGINS` is missing the
frontend's origin.

---

## 6. Known limits of this setup

- **Playback URLs are public and unauthenticated** (tech-spec T9). Anyone who can reach the API
  can read every stream URL. Do not put real licensed content behind this as it stands.
- **The seeded sample streams are Google's public test files.** Some networks return 403 for
  them, which surfaces as *"This stream could not be loaded."* — see tracker H3b.
- **No custom domain** is configured; both projects use their `*.vercel.app` origins.
- **Cold starts** apply to the API. The first request after idle will be noticeably slower.
