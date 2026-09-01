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
| `isOriginal` | — | `true` or `false` |
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

### `GET /titles/search`

Searches title and genre across the **whole** catalog, and forgives a misspelling. Same card
projection, ordered best match first.

| Query param | Notes |
|-------------|-------|
| `q` | Under two characters returns `[]` — a single letter would scan the catalog for nothing useful |
| `limit` | Default 40, capped at 100 |

Ranking lives in `services/titleSearch.js`, not in SQL. A `LIKE` only ever finds what the viewer
spelled exactly, and "intersteller" or "crary jata" returned nothing at all. Postgres could do this
with `pg_trgm`, but that needs an extension and a migration on the hosted database, which only the
deployed API can reach; scoring in the API needs neither.

Order of preference, highest first: exact title, prefix, word-boundary match, substring, every word
present in any order, then corrections — trigram similarity against the title and against each run
of words the query could have meant, then word-by-word edit distance. **An exact spelling always
outranks a correction.** Edit distance counts a swap of neighbouring letters as one edit, not two,
because that is most of what real typing gets wrong. Stopwords (`the`, `on`, `ka`, `part`…) are
ignored when scoring partial matches — counting them put *Godzilla Minus One* in the results for
"carry on jatta".

Candidates come from the database, not from a copy of the catalog held in the function. An
in-memory index worked at 7,000 titles and broke silently at 85,000: capped by recency, it held
only the most recent import, and "sholey" stopped finding *Sholay* because *Sholay* was no longer
in it. The query now asks Postgres for up to 400 candidates using `pg_trgm`, and the scoring above
puts them in order.

Two trigram measures, because they fail differently: `similarity` compares whole strings, so a
one-word query against a long title scores low however exact — "crary" against "Carry On Jatta" is
0.11 — while `word_similarity` compares against the best-matching run of words, 0.20 for the same
pair.

`GET /admin/reindex` installs everything the code expects the database to have: the `voteAverage` /
`voteCount` / `popularity` columns, the indexes the home page's rows sort on, the `Track` table, and
`pg_trgm` with the trigram index. Everything is `IF NOT EXISTS`, so running it twice costs nothing.

**Additive schema changes go here, and are mirrored in `schema.prisma`.** Not because that is
tidier — `prisma migrate` cannot open a connection to the hosted database from a machine with no
route to Postgres on 5432, which is the situation this project is in.

`GET /admin/remove-seed` deletes the three demo titles the project shipped with. Dry run unless
`?apply=true`.

The trigram index specifically, once per database. Without them
search still works, narrowed to exact matching, and logs that it has.

`sort` picks what the home page's rows are: `trending` (TMDB popularity), `viewed` (vote count),
`rated` (score, with at least 200 votes — one ten-out-of-ten vote is not a well-rated film),
`recent` (released, with at least 50 votes — TMDB carries titles years ahead of their date and
ordering by year alone fills the row with films nobody can watch yet), or `newest` (default, by
`createdAt`).

`voteAverage`, `voteCount` and `popularity` are TMDB's own numbers, carried through by the import
and null for anything not from TMDB. Nobody has watched anything in this catalog, so "most viewed"
is vote count — the closest honest stand-in, and named as a stand-in here rather than pretended to
be a view count.

### Music

Tracks are YouTube videos. YouTube Music's catalogue *is* YouTube's — the Indian labels put
everything on it — and the embedded player is the licensed way to reach it: YouTube serves the ads,
the rights holders get paid. Nothing in the API touches audio; `sourceId` is a video id and the
browser plays it through YouTube's own player, which stays visible because hiding it is against the
terms it is allowed under.

| Route | What it does |
|-------|--------------|
| `GET /music/tracks` | What is charting in a region. `limit`, `region` (default `IN`) |
| `GET /music/search?q=` | Songs, ranked so the original comes first. Under two characters returns `[]` |
| `GET /music/albums?q=` | Albums and playlists. Its own 100 units — playlists do not come back from a video search however wide it is asked to be, which was tested |
| `GET /music/related?title=&artist=&exclude=` | Songs like this one — not other copies of it |
| `GET /music/stream/:id` | The audio itself, proxied from the track's `audioUrl`. GET and HEAD |
| `GET /music/genres` | Counts, for a client that wants to group |

**Putting the original first.** A YouTube search for a song returns the label's upload, a lyric
video, three reuploads, a slowed-and-reverbed edit and a dance cover, in whatever order YouTube
likes. There is no "official" flag in the API, so `rankByOriginality` reads the two things that do
carry the signal: a VEVO or label channel scores up, a title saying "lyrics", "cover", "slowed" or
"remix" scores down, and YouTube's own relevance stays as the tiebreak rather than being thrown
away. Cached rows are ranked again on the way out, because the table returns them in insert order.

**Why there is a streaming proxy.** The player is a plain `<audio>` element, because that is the
only thing that keeps playing when a phone's screen goes off — a player inside an iframe is
suspended by the browser whatever the page does. The element needs bytes, and `/music/stream/:id`
is where it asks: a proxy in front of whatever URL the catalog holds, so storage can move and URLs
can be signed without the browser knowing.

Two details it lives or dies by, both verified against the deployed endpoint: a Range request is
answered with **206** and a correct `Content-Range` (iOS opens with `Range: bytes=0-1` and refuses
to play on a 200, and a framework will normalise that away if the status is not set explicitly),
and the upstream `Content-Type` is passed through rather than invented.

It is not a way to pull audio out of YouTube. Rows imported from YouTube carry no `audioUrl` and
are refused with a message saying so.

**Recommendations, without a recommendations API.** YouTube withdrew
`relatedToVideoId` in 2023, so "related" is built from what is left. The channel is the strongest
signal available: a label or artist channel holds work by the same people in the same idiom. Then
every version of the seed is dropped — the lyric video, the slowed edit, the audio reupload — by
comparing `titleCore`, the part of a title before the first dash, pipe or bracket, which is where
the credits start. Someone who just picked a song does not want it back five more times.

**Quota is what shapes this.** The free allowance is 10,000 units a day and a search costs 100 of
them — a hundred searches. So the charts come from `videos.list`, which costs 1 and can run on every
visit, and every search result is written to `Track`; a query the catalog can already answer with
eight rows or more is never sent to YouTube. When the quota does run out the charts fall back to
what is stored rather than showing an empty page.

Needs `YOUTUBE_API_KEY` on the deployment. Without it the charts fall back to the table and search
returns 503 saying so. `GET /admin/clear-music` empties the table; dry run unless `?apply=true`.

**Ruled out, and why.** Spotify serves metadata only — audio needs their SDK and each listener's own
Premium account, and the thirty-second preview was withdrawn from new apps in 2024. JioSaavn's
catalogue is licensed to JioSaavn; serving their CDN from here is redistribution. The GitHub
projects that appear to solve either work by ripping audio out of those services. Audius and the
Internet Archive were tried first and dropped: both serve whole tracks legally, but not the music
anyone asked for.

### `GET /titles/genres`

`[{ "genre": "Comedy", "count": 1579 }]`, ordered by count. Lets the client render one row per
genre without pulling the catalog down to group it in the browser.

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
| `media` | `movie`. `tv` walks TMDB's series catalogue instead |
| `provider` | Netflix, Amazon Prime Video, JioHotstar, Zee5. **`any` means no platform filter** |
| `genre`, `language`, `country`, `region` | — / — / — / `IN` |
| `year` | — (`primary_release_year` for films, `first_air_date_year` for series) |
| `fromPage`, `pages` | 1, 3 (capped at 10) |

`provider=any` exists because an omitted parameter already means "use the scheduled default", so
there was no way to ask for everything. Most of TMDB is not on the four services the nightly cron
watches, so the backfill needs it.

Films and series come from different TMDB endpoints with different field names — `name` and
`first_air_date` rather than `title` and `release_date` — and different genre tables (television
has no "Science Fiction", it has "Sci-Fi & Fantasy"). The import normalises both into `Title`,
with `contentType` set accordingly.

`pages` is capped because a serverless invocation is killed at its time limit and a half-finished
import reports nothing. A backlog is loaded by calling it repeatedly with `fromPage`.

**Every call is idempotent** — titles already stored are skipped — so a cron can run as often as
it likes and re-running a slice is harmless. The response reports `added`, `skipped`,
`failedPages` and `pagesRemaining`.

A Vercel cron in `server/vercel.json` calls it daily at 03:00 UTC. Sorted by popularity, a small
daily slice picks up new releases without needing a stored cursor.

### Filling the catalog

`prisma/backfill-catalog.mjs` drives the endpoint above until TMDB runs out:

```bash
node prisma/backfill-catalog.mjs --secret <CRON_SECRET>
```

It is only the caller — the import itself still runs on the server. It can be stopped and re-run at
any point, because every import is idempotent; a second run adds only what the first one missed.

`prisma/backfill-direct.mjs` does the same job without the API, writing to the database itself:

```bash
BACKFILL_URL="postgres://…" node prisma/backfill-direct.mjs --languages hi,pa,ta --max-pages 200
```

Both exist because a machine behind a restrictive network cannot open a Postgres connection on 5432
— which is what sent the import server-side in the first place. Neon also speaks SQL over HTTPS on
443, which is not blocked, so `@neondatabase/serverless` gets a local run through after all. Use the
API driver when you have `CRON_SECRET`, this one when you have a database URL.

`--max-pages` caps how much of any one query is taken. English alone is 558,000 films; drained in
full that is several hundred thousand rows, more than the database is sized for and far more than
anyone will browse. The cap keeps the most popular of each year and language.

The constraint it works around: TMDB serves at most 500 pages of 20 for any one query, a hard
10,000-row ceiling. "Everything" is therefore not one request but many narrow ones. Slices are cut
by medium and original language, and any slice that would hit the ceiling is cut again by year.

### Removing duplicate rows

`GET /admin/dedupe` clears up what the bulk imports left behind. The Bollywood, Pollywood and
Hollywood files were generated separately, each de-duplicating only against the catalog as it stood
when it was written, so a film in two slices was inserted twice and shows twice in search.

Same `CRON_SECRET` guard as the refresh. **It is a dry run unless called with `?apply=true`** —
deleting catalog rows is not something a mistyped URL should be able to do.

Rows are grouped by title (case-insensitive) and release year. Within a group the row kept is the
playable one, then an original, then the oldest — whose id is what any existing link points at. A
duplicate is only deleted when nothing would be lost with it: no stream, no seasons, and nothing on
anyone's list or watch history. Anything else is reported in `keptDespiteDuplicate` and left alone.

The response reports `scanned`, `duplicateGroups`, `removable`, `deleted` and `keptDespiteDuplicate`.

### The `Uncategorised` genre

TMDB gives some films no genre, and the importer labels those `Uncategorised`. It is a bookkeeping
value, not a shelf anyone would browse, so `/titles/genres` and `/titles/trending` exclude it — it
gets no row on the home page and can no longer turn up as the hero. The titles stay in the catalog
and are still returned by `/titles/search` and by an explicit `/titles?genre=Uncategorised`.

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
