# Onion TV — Data Model & API Contract

> **Status:** Living document. Last updated 2026-08-31.
> **Source of truth:** `server/prisma/schema.prisma` for the data model, `server/src/controllers/titlesController.js` for the API.
> Update this file in the same commit as any schema or endpoint change.

---

## 1. Entity relationships

```
User ─┬─< WatchProgress >─┬─ Title ──< Season ──< Episode
      │                   │              │            │
      └─< MyListItem >────┘              └────────────┘
                                    WatchProgress >─ Episode (optional)
```

- A **Title** is either a `movie` (its own `playbackUrl`, `durationMinutes`) or a `series`
  (playback and duration live on its Episodes).
- **Seasons** and **Episodes** cascade-delete with their parent.
- **WatchProgress** and **MyListItem** cascade-delete with their User and Title.

---

## 2. Models

### `ContentType` (enum)

`movie` | `series`

### `Title`

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (uuid) | PK |
| `title` | String | |
| `description` | Text | |
| `contentType` | ContentType | Indexed |
| `genre` | String | Indexed. Free-form string, **not** an enum or relation — drives Home's dynamic rows |
| `releaseYear` | Int | |
| `rating` | String | e.g. `TV-MA`, `PG-13` |
| `durationMinutes` | Int? | **Movies only.** Series duration comes from episodes |
| `thumbnailUrl` | String | CSS gradient **or** image URL — see design.md §7 |
| `heroImageUrl` | String? | Same dual meaning |
| `playbackUrl` | String? | **Movies only.** Never returned by `GET /titles/:id` |
| `isOriginal` | Boolean | Default `false`. Drives the "Onion Originals" row |
| `createdAt` / `updatedAt` | DateTime | `createdAt desc` is the default ordering everywhere |

### `Season`

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (uuid) | PK |
| `titleId` → `Title` | String | Cascade delete |
| `seasonNumber` | Int | Ordered ascending in API responses |
| `synopsis` | Text? | |

### `Episode`

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (uuid) | PK |
| `seasonId` → `Season` | String | Cascade delete |
| `episodeNumber` | Int | Ordered ascending |
| `title` | String | Seed data prefixes the number, e.g. `"1. Pilot — The Signal"` |
| `description` | Text | |
| `durationMinutes` | Int | Required, unlike on Title |
| `thumbnailUrl` | String | |
| `playbackUrl` | String | Required. **Never** returned by `GET /titles/:id` |

### `User` — *schema only, no API*

`id`, `email` (unique), `passwordHash`, `username` (unique), `createdAt`, `updatedAt`.
No route creates, reads or authenticates a User. `JWT_SECRET` is reserved but unused.

### `WatchProgress` — *schema only, no API*

`id`, `userId`, `titleId`, `episodeId?` (null for movies), `progressSeconds`, `completed`, `updatedAt`. Indexed on `userId`.

### `MyListItem` — *schema only, no API*

`id`, `userId`, `titleId`, `addedAt`. Indexed on `userId`.

### Indexes

`Title.contentType`, `Title.genre`, `WatchProgress.userId`, `MyListItem.userId`,
plus unique constraints on `User.email` and `User.username`.

---

## 3. API contract

Base URL: `http://localhost:5000` (override with `VITE_API_URL` on the frontend).
All responses are JSON. **No endpoint requires authentication today.**

### `GET /`

Service info. Used by the smoke test.

```json
{
  "name": "Onion VOD Backend API",
  "status": "online",
  "health": "/health",
  "frontendUrl": "http://localhost:5173",
  "endpoints": { "titles": "/titles" }
}
```

### `GET /health`

Runs `SELECT 1` against PostgreSQL.

- `200` → `{ "status": "ok", "message": "Onion VOD server & database healthy" }`
- `500` → `{ "status": "error", "message": "Database connection failed", "error": "…" }`

### `GET /titles`

Catalog list. **Returns a card-shaped projection, not the full row.**

| Query param | Default | Notes |
|-------------|---------|-------|
| `genre` | — | Case-insensitive exact match |
| `contentType` | — | `movie` or `series` |
| `limit` | 20 | Home requests 100 |
| `offset` | 0 | |

Ordered `createdAt desc`. Response is an array of:

```json
{
  "id": "uuid",
  "title": "…",
  "thumbnailUrl": "…",
  "heroImageUrl": "…",
  "genre": "Sci-Fi",
  "releaseYear": 2026,
  "contentType": "series",
  "rating": "TV-MA",
  "isOriginal": true
}
```

No `description`, no `durationMinutes`, no `playbackUrl`, no `seasons`.

**Consequence:** anything needing a description must fetch `/titles/:id`. Home's hero does
exactly that for the featured title. Do not add `description` to this projection to save a
request — it would be carried by every one of up to 100 rows for the benefit of one.

- `500` → `{ "error": "Failed to fetch titles." }`

### `GET /titles/trending`

Same projection, hardcoded `take: 10`, ordered `createdAt desc`. **Ignores all query params.**
There is no real trending signal — it is "10 most recently added".

- `500` → `{ "error": "Failed to fetch trending titles." }`

### `GET /titles/:id`

Full title detail with nested seasons and episodes.

**Two deliberate omissions:**
1. The title's own `playbackUrl` is destructured off the response object.
2. Episodes' `playbackUrl` is excluded from the Prisma `select`.

Both are only obtainable from `/titles/:id/playback`.

```json
{
  "id": "uuid",
  "title": "Undertow",
  "description": "…",
  "contentType": "series",
  "genre": "Sci-Fi",
  "releaseYear": 2026,
  "rating": "TV-MA",
  "durationMinutes": null,
  "thumbnailUrl": "linear-gradient(135deg, #3A1F22, #17141A)",
  "heroImageUrl": "…",
  "isOriginal": true,
  "createdAt": "…",
  "updatedAt": "…",
  "seasons": [
    {
      "id": "uuid",
      "seasonNumber": 1,
      "synopsis": "…",
      "episodes": [
        { "id": "uuid", "episodeNumber": 1, "title": "1. Pilot — The Signal",
          "description": "…", "durationMinutes": 48, "thumbnailUrl": "…" }
      ]
    }
  ]
}
```

For a movie, `seasons` is `[]`.

- `404` → `{ "error": "Title not found." }`
- `500` → `{ "error": "Failed to fetch title details." }`

### `GET /titles/:id/playback`

The only source of stream URLs.

| Query param | Required for |
|-------------|--------------|
| `episodeId` | Series. Omitting it is a `400` |

Movies ignore `episodeId` entirely and return the title's own URL.

The stored URL passes through `resolvePlaybackUrl()` in `services/videoProvider.js`:
with `VIDEO_PROVIDER` unset it is returned unchanged; with it set, the provider block resolves
it (both currently throw — see tech-spec.md §4).

```json
{ "playbackUrl": "https://…/BigBuckBunny.mp4" }
```

- `400` → `{ "error": "Query parameter 'episodeId' is required for series playback." }`
- `404` → `{ "error": "Title not found." }` / `{ "error": "Episode not found." }`
- `500` → `{ "error": "Failed to fetch playback stream URL." }`

### Global handlers

- Unmatched route → `404` `{ "error": "Route /whatever not found." }`
- Unhandled throw → `500` `{ "error": "Internal server error. Please try again." }`

### Error shape

Every error is `{ "error": "<human-readable message>" }`. `src/api/client.js` reads `data.error`,
attaches `status` and `data` to the thrown `Error`, and replaces network-level failures with
*"Unable to connect to streaming server. Please check your network connection."*

**Keep the `error` key.** Renaming it silently degrades every message in the UI.

---

## 4. Seed data

`server/prisma/seed.js` wipes all six tables and inserts three titles:

| Title | Type | Genre | Original | Content |
|-------|------|-------|----------|---------|
| Undertow | series | Sci-Fi | yes | Season 1, 2 episodes |
| How Bread Works | movie | — | — | Single playback URL |
| Building a Synth from Scratch | movie | Technology | — | Single playback URL |

All `thumbnailUrl` / `heroImageUrl` values are CSS gradients, not images.
All playback URLs point at Google's public `gtv-videos-bucket` sample MP4s.

Run with `node prisma/seed.js` from `server/`. **It deletes everything first** — never run it
against a database with real data.

### Keeping the catalog current

`GET /admin/refresh` runs the import **on the server**, which is the only place that can reach
both TMDB and the database — a developer machine behind a restrictive network often cannot.
Nobody has to paste SQL.

Guarded by `CRON_SECRET`, accepted as `Authorization: Bearer <secret>` (what Vercel Cron sends)
or `?secret=`. **With no `CRON_SECRET` set the route refuses everything** rather than defaulting
open.

| Query param | Default |
|-------------|---------|
| `provider` | Netflix, Amazon Prime Video, JioHotstar, Zee5 |
| `genre`, `language`, `country`, `region` | — / — / — / `IN` |
| `fromPage`, `pages` | 1, 3 (capped at 10) |

`pages` is capped because a serverless invocation is killed at its time limit and a half-finished
import reports nothing. A backlog is loaded by calling it repeatedly with `fromPage`.

**Every call is idempotent** — titles already stored are skipped — so a cron can run as often as
it likes and re-running a slice is harmless. The response reports `added`, `skipped`,
`failedPages` and `pagesRemaining`.

A Vercel cron in `server/vercel.json` calls it daily at 03:00 UTC. Sorted by popularity, a small
daily slice picks up new releases without needing a stored cursor.

### Importing real titles

`prisma/import-tmdb.js` adds a real film from TMDB, with its backdrop, synopsis, runtime,
certification and genre. Unlike the seed it **only inserts** — it never clears anything.

```bash
npm run import:tmdb -- "Dune" --year 2021 --playback "https://…/stream.mp4" --original
```

| Flag | Effect |
|------|--------|
| `--year` | Narrows the search, for remakes |
| `--playback` | The stream URL. Without it the title imports but cannot play |
| `--original` | Marks it an Onion Original |
| `--force` | Import even though a title with that name exists |
| `--sql` | Print an `INSERT` instead of writing, for when you can reach TMDB but not the database |

Notes on the mapping:

- **Backdrops, not posters.** Cards and the hero are landscape; a poster is portrait and renders
  wrong in both.
- **One genre.** `Title.genre` is a single string; TMDB returns several and the first is taken.
- **The certification is a second request.** It is not on the movie record — it lives in
  per-country release data, and falls back to `NR`.
- **`--sql` fills in `id` and `updatedAt` itself.** Neither has a database default — Prisma
  supplies both from the client — so a raw `INSERT` has to provide them, via `gen_random_uuid()`
  and `NOW()`.
### Bulk import by platform and genre

`prisma/import-tmdb-bulk.js` fills the catalog from TMDB's discover endpoint, filtered by
streaming platform and genre.

```bash
npm run import:tmdb:bulk -- --provider Netflix,"Amazon Prime Video" --genre Horror --pages 5
```

| Flag | Effect |
|------|--------|
| `--provider` | Comma separated platform names, resolved against TMDB's list for the region |
| `--genre` | Comma separated genre names |
| `--region` | Watch region for provider filtering (default `IN`) |
| `--country` | Country the film was **made in**, e.g. `IN` for Indian cinema |
| `--language` | Original language, e.g. `hi`, `ta`, `te` |
| `--pages` | Pages of 20 to fetch (default 3) |
| `--details` | Also fetch runtime and certification — two extra requests per title |
| `--playback` | Stream URL attached to every imported title |
| `--out` | Write INSERTs to a file instead of the database |
| `--chunk` | Split `--out` into files of *n* statements, so each one will paste into a browser SQL console |

- **`--region` does not select Indian films.** It only says where a title is *available*, so a
  popularity sort still returns global hits. `--country IN` selects films made in India across
  every Indian language (7,002 of them); `--language hi` narrows further to Hindi (2,576).
- **TMDB serves at most 500 discover pages** (10,000 titles) per query, whatever `total_pages`
  claims. Broad queries have to be split by language, country or genre to get past that — which
  is also why a platform filter matters: Hollywood alone is 478,215 titles unfiltered, and
  unreachable.
- **A failed page is skipped, not fatal.** TMDB returns intermittent 503s that outlast the
  client's backoff; aborting the run would cost hours of progress for one blip. Six consecutive
  failures does stop it, on the grounds that TMDB is then genuinely down. The run reports how
  many pages it lost.
- **One request per 20 titles.** Genre names come from the ids the listing already returns, so
  no per-title call is needed. `--details` is opt-in because it turns a 25-request import into a
  2,000-request one.
- **The requested genre wins the label.** `Title.genre` holds one value and TMDB returns several;
  without this a `--genre Horror` import fills the catalog with rows labelled *Thriller*, because
  that was TMDB's first id.
- **Titles with no release date are skipped** — `releaseYear` is `NOT NULL`.
- **Nothing imported this way can play** unless `--playback` is given. These are other platforms'
  films; we hold no streams for them.

- **Movies only.** A series would need a `playbackUrl` for every episode, since
  `Episode.playbackUrl` is required, and TMDB has no streams to supply — importing one would mean
  inventing data for every episode.

---

## 5. Migrations

One migration exists: `server/prisma/migrations/20260801204021_init`.

Workflow for any schema change:

1. Edit `server/prisma/schema.prisma`
2. `npm run prisma:migrate` (from `server/`) — creates and applies the migration
3. `npm run prisma:generate` — regenerates the client
4. Update this document
5. Update `server/prisma/seed.js` if new required fields were added

Never hand-edit a migration SQL file that has already been applied.

---

## 6. Contract rules

1. **`playbackUrl` never leaves via a list or detail endpoint.** Adding it to a `select` is a regression.
2. `/titles` and `/titles/trending` must return the *same* projection — `ContentCard` consumes both.
3. Route order in `routes/titles.js` matters: `/trending` is declared before `/:id`. Adding a
   static path after `/:id` will make it match as an id instead.
4. Always import the shared client from `src/config/db.js`. Never `new PrismaClient()`.
5. Every new endpoint gets a case in `server/test-api.js`.
