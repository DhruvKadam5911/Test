// Must be first: the TMDB service reads process.env, and ESM evaluates imports
// before this module's body.
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

import { discoverMovies, discoverTv, getGenres, imageUrl, isTmdbConfigured } from "../src/services/tmdb.js";

/*
 * Fill the catalog from TMDB, writing straight to the database.
 *
 *   BACKFILL_URL="postgres://…" node prisma/backfill-direct.mjs
 *
 * The sibling script, backfill-catalog.mjs, drives the deployed API instead.
 * That one needs CRON_SECRET; this one needs a database URL. Both exist because
 * this machine cannot open a Postgres connection on 5432 — Neon's HTTP driver
 * goes over 443, which is not blocked, so the import can run locally after all.
 *
 * Idempotent: every title already stored is skipped, so it can be stopped and
 * re-run at any point and will pick up where it left off.
 *
 * The shape of the problem: TMDB serves at most 500 pages of 20 for any one
 * query, a hard 10,000-row ceiling. "Everything" is therefore not one request —
 * it is many narrow ones, cut by medium and language, and cut again by year
 * when a slice would hit the ceiling.
 */

const sql = neon(process.env.BACKFILL_URL || process.env.DATABASE_URL);

/**
 * One statement, retried. The HTTP endpoint drops the occasional connection —
 * a single `fetch failed` killed a run that had nothing else wrong with it.
 */
async function query(text, params = []) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await sql.query(text, params);
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
}

const MAX_PAGE = 500;
const PAGE_SIZE = 20;
const MAX_REACHABLE = MAX_PAGE * PAGE_SIZE;
const INSERT_BATCH = 500;
// TMDB 503s come in bursts; this many in a row means it is genuinely down.
const MAX_CONSECUTIVE_FAILURES = 6;

// Indian cinema first — it is what the catalog is short of — then English.
const LANGUAGES = [
  ["hi", "Hindi"], ["pa", "Punjabi"], ["ta", "Tamil"], ["te", "Telugu"],
  ["ml", "Malayalam"], ["kn", "Kannada"], ["bn", "Bengali"], ["mr", "Marathi"],
  ["gu", "Gujarati"], ["ur", "Urdu"], ["en", "English"],
];

const YEAR_TO = new Date().getFullYear();
const YEAR_FROM = 1970;

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const MAX_TITLES = Number(argOf("--max-titles", Infinity));
// Pages to take from any one query. English alone is 558,000 films; drained in
// full it would be several hundred thousand rows, which is more than the
// database is sized for and far more than anyone will browse. Capping keeps the
// most popular of every year and every language.
const MAX_PAGES = Math.min(Number(argOf("--max-pages", MAX_PAGE)), MAX_PAGE);
const ONLY_MEDIA = argOf("--media", null);
const ONLY_LANGUAGES = argOf("--languages", null)?.split(",");

/** Titles already stored, lowercased. Held in memory so no insert needs a lookup. */
const known = new Set();
let added = 0;
let failedPages = 0;

async function loadExisting() {
  // Paged because the HTTP driver returns the whole result at once.
  for (let offset = 0; ; offset += 5000) {
    const rows = await query('select title from "Title" order by title limit 5000 offset $1', [offset]);
    for (const r of rows) known.add(r.title.trim().toLowerCase());
    if (rows.length < 5000) break;
  }
}

const COLUMNS = [
  "title", "description", "contentType", "genre", "releaseYear", "rating",
  "durationMinutes", "thumbnailUrl", "heroImageUrl", "playbackUrl", "isOriginal",
];

async function insertBatch(rows) {
  if (!rows.length) return 0;

  const params = [];
  const tuples = rows.map((row) => {
    const start = params.length;
    params.push(
      row.title, row.description, row.contentType, row.genre, row.releaseYear,
      row.rating, row.durationMinutes, row.thumbnailUrl, row.heroImageUrl,
      row.playbackUrl, row.isOriginal
    );
    const p = (n) => `$${start + n}`;
    // id and updatedAt have no database default — Prisma generates both on the
    // client, so an INSERT that omits them fails on a NOT NULL violation.
    return `(gen_random_uuid(), ${p(1)}, ${p(2)}, ${p(3)}::"ContentType", ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, ${p(10)}, ${p(11)}, NOW())`;
  });

  const columns = ["id", ...COLUMNS, "updatedAt"].map((c) => `"${c}"`).join(", ");
  await query(`INSERT INTO "Title" (${columns}) VALUES ${tuples.join(", ")}`, params);
  return rows.length;
}

/** Films and series come back with different field names. */
function normalise(item, media) {
  return media === "tv"
    ? { name: item.name, date: item.first_air_date, contentType: "series" }
    : { name: item.title, date: item.release_date, contentType: "movie" };
}

function labelGenre(ids = [], nameById) {
  return nameById.get(ids[0]) || "Uncategorised";
}

/** Walk one slice from page 1 until TMDB has nothing left to give. */
async function drain(label, { media, language, year }, genreNameById) {
  const discover = media === "tv" ? discoverTv : discoverMovies;
  const yearFilter = year
    ? media === "tv"
      ? { first_air_date_year: year }
      : { primary_release_year: year }
    : {};

  let pending = [];
  let sliceAdded = 0;
  let consecutiveFailures = 0;
  let total = null;

  for (let page = 1; page <= MAX_PAGES && added < MAX_TITLES; page++) {
    let data;
    try {
      data = await discover({
        page,
        with_original_language: language,
        sort_by: "popularity.desc",
        ...yearFilter,
      });
    } catch {
      failedPages++;
      if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
      continue;
    }
    consecutiveFailures = 0;

    if (total === null) {
      total = data.total_results ?? 0;
      if (!total) return { total: 0, sliceAdded: 0 };
    }
    if (!data.results?.length) break;

    for (const item of data.results) {
      const { name, date, contentType } = normalise(item, media);
      const releaseYear = Number((date || "").slice(0, 4));
      // releaseYear is NOT NULL, so a title TMDB has no date for cannot be stored.
      if (!name || !releaseYear) continue;

      const key = name.trim().toLowerCase();
      if (known.has(key)) continue;
      known.add(key);

      pending.push({
        title: name,
        description: item.overview || "No description available.",
        contentType,
        genre: labelGenre(item.genre_ids, genreNameById),
        releaseYear,
        rating: "NR",
        durationMinutes: null,
        thumbnailUrl:
          imageUrl(item.backdrop_path, "w780") || "linear-gradient(135deg, #241B2E, #17141A)",
        heroImageUrl: imageUrl(item.backdrop_path, "original"),
        playbackUrl: null,
        isOriginal: false,
      });
    }

    if (pending.length >= INSERT_BATCH) {
      sliceAdded += await insertBatch(pending);
      added += pending.length;
      pending = [];
      process.stdout.write(`\r   ${label} — page ${page}, +${sliceAdded} (catalog +${added})      `);
    }

    // The last page of results, whatever total_pages claimed.
    if (page >= Math.ceil(Math.min(total, MAX_REACHABLE) / PAGE_SIZE)) break;
    if (page >= MAX_PAGES) break;
  }

  if (pending.length) {
    sliceAdded += await insertBatch(pending);
    added += pending.length;
  }
  process.stdout.write(`\r   ${label} — done, +${sliceAdded} (catalog +${added})            \n`);
  return { total, sliceAdded };
}

async function main() {
  if (!isTmdbConfigured()) throw new Error("TMDB_API_KEY is not set in server/.env.");
  if (!process.env.BACKFILL_URL && !process.env.DATABASE_URL) {
    throw new Error("Set BACKFILL_URL to the database to write to.");
  }

  console.log("📥 Reading what is already stored…");
  await loadExisting();
  const startedWith = known.size;
  console.log(`   ${startedWith.toLocaleString()} titles already in the catalog\n`);

  for (const media of ["movie", "tv"]) {
    if (ONLY_MEDIA && ONLY_MEDIA !== media) continue;

    const genreNameById = new Map((await getGenres(media)).map((g) => [g.id, g.name]));

    for (const [code, name] of LANGUAGES) {
      if (ONLY_LANGUAGES && !ONLY_LANGUAGES.includes(code)) continue;
      if (added >= MAX_TITLES) break;

      const label = `${name} ${media === "tv" ? "series" : "films"}`;

      // The unsharded pass also reports how big the slice is, so whether it
      // needs cutting by year is known only after it has run once.
      const first = await drain(label, { media, language: code }, genreNameById);
      if (!first.total) {
        console.log(`   ${label} — nothing on TMDB`);
        continue;
      }

      if (first.total > MAX_REACHABLE) {
        // Past the ceiling, so ask year by year. Each year is its own query
        // with its own 10,000-row window.
        console.log(`   ${label}: ${first.total.toLocaleString()} on TMDB — over the ceiling, going year by year`);
        for (let year = YEAR_TO; year >= YEAR_FROM && added < MAX_TITLES; year--) {
          await drain(`${label} ${year}`, { media, language: code, year }, genreNameById);
        }
      }
    }
  }

  const finished = await query('select count(*)::int as n from "Title"');
  console.log(`\n✅ ${added.toLocaleString()} titles added. Catalog is now ${finished[0].n.toLocaleString()}.`);
  if (failedPages) console.log(`   ${failedPages} page(s) failed and were skipped — re-run to pick them up.`);
  console.log("⚠️  None of these have a stream, so they browse and search but do not play.");
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exitCode = 1;
});
