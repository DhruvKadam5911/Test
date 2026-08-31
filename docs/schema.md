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
