import { importSlice, MAX_PAGE } from "../services/catalogImport.js";
import { dedupeTitles } from "../services/catalogCleanup.js";
import { importMusicSlice } from "../services/musicImport.js";
import prisma from "../config/db.js";
import { isTmdbConfigured } from "../services/tmdb.js";

/*
 * Catalog refresh, run on the server rather than by pasting SQL.
 *
 * Guarded by CRON_SECRET. Without it set, the route refuses everything — an
 * open endpoint that writes to the catalog is not something to leave running
 * by accident.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; a `secret` query
 * parameter is accepted too so it can be triggered by hand.
 */

// What the scheduled run pulls. Sorted by popularity, so a small daily slice
// naturally picks up new releases without needing a stored cursor.
const SCHEDULED_SLICE = {
  providers: ["Netflix", "Amazon Prime Video", "JioHotstar", "Zee5"],
  region: "IN",
  pages: 3,
};

function authorised(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return req.query.secret === secret;
}

export async function refreshCatalog(req, res) {
  if (!authorised(req)) {
    // Deliberately vague: do not confirm whether the secret is merely wrong or
    // has never been configured.
    return res.status(401).json({ error: "Unauthorized." });
  }

  if (!isTmdbConfigured()) {
    return res.status(503).json({ error: "TMDB_API_KEY is not configured on this deployment." });
  }

  const { language, country, genre, provider, fromPage, pages, region, media, year } = req.query;
  const list = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : undefined);

  // `provider=any` means no platform filter. The nightly cron watches four
  // services, but most of TMDB is not on them, so the backfill needs a way to
  // ask for everything — and an omitted parameter cannot express that, since it
  // already means "use the scheduled default".
  const providers = provider === "any" ? [] : list(provider) ?? SCHEDULED_SLICE.providers;

  try {
    const result = await importSlice({
      media: media === "tv" ? "tv" : "movie",
      providers,
      genres: list(genre) ?? [],
      language: language || null,
      country: country || null,
      year: Number(year) || null,
      region: region || SCHEDULED_SLICE.region,
      fromPage: Math.max(1, Math.min(Number(fromPage) || 1, MAX_PAGE)),
      // Capped because a serverless invocation is killed at its time limit and
      // a half-finished import reports nothing.
      pages: Math.max(1, Math.min(Number(pages) || SCHEDULED_SLICE.pages, 10)),
    });

    return res.status(200).json({ status: "ok", ...result });
  } catch (error) {
    console.error("refreshCatalog error:", error);
    return res.status(500).json({ error: error.message || "Catalog refresh failed." });
  }
}

/*
 * GET /admin/dedupe
 *
 * Reports the duplicate rows the bulk imports left behind. Dry run by default —
 * it only deletes when called with ?apply=true, because deleting catalog rows
 * is not something a mistyped URL should be able to do.
 */
export async function dedupe(req, res) {
  if (!authorised(req)) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  try {
    const result = await dedupeTitles({ apply: req.query.apply === "true" });
    return res.status(200).json({ status: "ok", ...result });
  } catch (error) {
    console.error("dedupe error:", error);
    return res.status(500).json({ error: error.message || "Dedupe failed." });
  }
}

/*
 * GET /admin/reindex
 *
 * Installs what search needs: pg_trgm and a trigram index on the title. Run
 * once, and again only if the database is rebuilt — everything is IF NOT
 * EXISTS, so calling it twice costs nothing.
 *
 * Search cannot rank eighty thousand rows inside a request, so it asks the
 * database for candidates first. Without this index that query is a sequential
 * scan on every keystroke.
 */
export async function reindex(req, res) {
  if (!authorised(req)) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  try {
    // Columns first. Prisma migrations cannot run from a machine that has no
    // route to Postgres on 5432, which is the situation this project is in, so
    // additive schema changes are applied here and mirrored in schema.prisma.
    for (const column of [
      '"voteAverage" DOUBLE PRECISION',
      '"voteCount" INTEGER',
      '"popularity" DOUBLE PRECISION',
    ]) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Title" ADD COLUMN IF NOT EXISTS ${column}`);
    }

    // The rows the home page orders by. Without these each is a full sort of
    // 148,000 rows.
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "Title_popularity_idx" ON "Title" ("popularity" DESC NULLS LAST)'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "Title_voteAverage_idx" ON "Title" ("voteAverage" DESC NULLS LAST)'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "Title_voteCount_idx" ON "Title" ("voteCount" DESC NULLS LAST)'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "Title_releaseYear_idx" ON "Title" ("releaseYear" DESC)'
    );

    // The music player's tracks. Same reason as the columns above.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Track" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        "audioUrl" TEXT NOT NULL,
        "artworkUrl" TEXT,
        "durationSeconds" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
      )
    `);

    // Where a track came from, and the id its source gave it. The unique index
    // is what makes a re-run of a music slice insert nothing twice.
    for (const column of ["source TEXT", '"sourceId" TEXT', "genre TEXT"]) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS ${column}`);
    }
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "Track_source_sourceId_key" ON "Track" (source, "sourceId")'
    );

    await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "Title_title_trgm_idx" ON "Title" USING gin (lower(title) gin_trgm_ops)'
    );
    return res.status(200).json({ status: "ok", message: "Columns, sort indexes, pg_trgm and the title index are in place." });
  } catch (error) {
    console.error("reindex error:", error);
    return res.status(500).json({ error: error.message || "Reindex failed." });
  }
}

/*
 * GET /admin/remove-seed
 *
 * Deletes the three demo titles the project shipped with — Undertow and the two
 * documentaries from prisma/seed.js. Named explicitly rather than matched by a
 * pattern, because "everything with a stream" is the same set today and would
 * be the wrong thing to run tomorrow.
 *
 * Worth knowing before running it: these are the only titles in the catalog
 * that play. Everything imported from TMDB is metadata with no stream, so
 * afterwards nothing plays at all.
 *
 * Dry run unless called with ?apply=true. Cascades to their seasons and
 * episodes, which is what the schema asks for.
 */
const SEED_TITLES = ["Undertow", "How Bread Works", "Building a Synth from Scratch"];

export async function removeSeed(req, res) {
  if (!authorised(req)) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  try {
    const matches = await prisma.title.findMany({
      where: { title: { in: SEED_TITLES } },
      select: { id: true, title: true, playbackUrl: true },
    });

    const apply = req.query.apply === "true";
    let deleted = 0;
    if (apply && matches.length) {
      const result = await prisma.title.deleteMany({ where: { id: { in: matches.map((m) => m.id) } } });
      deleted = result.count;
    }

    return res.status(200).json({
      status: "ok",
      found: matches.map((m) => m.title),
      playable: matches.filter((m) => m.playbackUrl).length,
      deleted,
      applied: apply,
    });
  } catch (error) {
    console.error("removeSeed error:", error);
    return res.status(500).json({ error: error.message || "Removing the seed titles failed." });
  }
}

/*
 * GET /admin/refresh-music
 *
 * The music equivalent of /admin/refresh. Same CRON_SECRET guard, same reason
 * for running server-side, same idempotency.
 */
export async function refreshMusic(req, res) {
  if (!authorised(req)) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const { source, genre, fromPage, pages } = req.query;

  try {
    const result = await importMusicSlice({
      source: source === "archive" ? "archive" : "audius",
      genre: genre || null,
      fromPage: Math.max(1, Number(fromPage) || 1),
      // Capped for the same reason the film import is: a half-finished slice
      // killed at the time limit reports nothing.
      pages: Math.max(1, Math.min(Number(pages) || 2, 10)),
    });

    return res.status(200).json({ status: "ok", ...result });
  } catch (error) {
    console.error("refreshMusic error:", error);
    return res.status(500).json({ error: error.message || "Music refresh failed." });
  }
}
