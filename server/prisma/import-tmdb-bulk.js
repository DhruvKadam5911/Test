// Must be first: the TMDB service reads process.env, and ESM evaluates imports
// before this module's body.
import "dotenv/config";
import fs from "node:fs";

import prisma from "../src/config/db.js";
import { discoverMovies, getGenres, getProviders, imageUrl, isTmdbConfigured } from "../src/services/tmdb.js";
import { toInsert } from "./lib/titleSql.js";

/*
 * Bulk-import films from TMDB, filtered by streaming platform and genre.
 *
 *   node prisma/import-tmdb-bulk.js --provider Netflix,"Amazon Prime Video" --pages 5
 *   node prisma/import-tmdb-bulk.js --genre Action,Thriller --region IN --out catalog.sql
 *
 * One request per 20 titles. Genre names come from the ids TMDB already returns,
 * so no per-title call is needed; --details adds two calls each to fill in
 * runtime and certification, which the listing does not carry.
 *
 * These titles have no stream. Unless --playback is given they will import and
 * then fail to play — that is a known consequence of cataloguing other
 * platforms' content, not a bug in the player.
 */

const USAGE = `
Usage: node prisma/import-tmdb-bulk.js [options]

  --provider <names>   Comma separated, e.g. Netflix,"Amazon Prime Video"
  --genre <names>      Comma separated, e.g. Action,Thriller
  --region <cc>        Watch region for provider filtering (default IN)
  --country <cc>       Country the film was made in, e.g. IN for Indian cinema
  --language <code>    Original language, e.g. hi, ta, te
  --pages <n>          Pages of 20 to fetch (default 3)
  --details            Also fetch runtime and certification (2 extra calls each)
  --playback <url>     Stream URL to attach to every imported title
  --out <file.sql>     Write INSERTs to a file instead of the database
  --chunk <n>          Split --out into files of n statements, for paste limits
`;

const PAGE_SIZE = 20;
// TMDB refuses discover past page 500, whatever total_pages claims.
const MAX_PAGE = 500;
// TMDB's 503s come in bursts; this many in a row means it is genuinely down.
const MAX_CONSECUTIVE_FAILURES = 6;

function parseArgs(argv) {
  const args = {
    providers: [], genres: [], region: "IN", country: null, language: null,
    pages: 3, details: false, playback: null, out: null, chunk: null,
  };
  const rest = argv.slice(2);
  const list = (v) => v.split(",").map((s) => s.trim()).filter(Boolean);

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--provider") args.providers = list(rest[++i] ?? "");
    else if (a === "--genre") args.genres = list(rest[++i] ?? "");
    else if (a === "--region") args.region = rest[++i];
    else if (a === "--country") args.country = rest[++i];
    else if (a === "--language") args.language = rest[++i];
    else if (a === "--pages") args.pages = Number(rest[++i]);
    else if (a === "--details") args.details = true;
    else if (a === "--playback") args.playback = rest[++i];
    else if (a === "--out") args.out = rest[++i];
    else if (a === "--chunk") args.chunk = Number(rest[++i]);
    else throw new Error(`Unknown option: ${a}`);
  }

  if (!Number.isFinite(args.pages) || args.pages < 1) throw new Error("--pages must be a positive number.");
  if (args.pages > MAX_PAGE) {
    console.warn(`⚠️  TMDB serves at most ${MAX_PAGE} pages; asking for ${args.pages}. Capping.`);
    args.pages = MAX_PAGE;
  }
  return args;
}

/** Turn human names into TMDB ids, and say so clearly when one does not exist. */
function resolveNames(names, catalogue, kind) {
  return names.map((name) => {
    const match = catalogue.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!match) {
      const near = catalogue
        .filter((c) => c.name.toLowerCase().includes(name.toLowerCase().slice(0, 4)))
        .slice(0, 5)
        .map((c) => c.name);
      throw new Error(
        `Unknown ${kind} "${name}".` + (near.length ? ` Did you mean: ${near.join(", ")}?` : "")
      );
    }
    return match.id;
  });
}

/** The requested genre if the film has it, otherwise TMDB's own first choice. */
function labelGenre(ids = [], requestedIds, nameById) {
  const requested = ids.find((id) => requestedIds.includes(id));
  return nameById.get(requested ?? ids[0]) || "Uncategorised";
}

async function main() {
  const args = parseArgs(process.argv);

  if (!isTmdbConfigured()) {
    throw new Error("TMDB_API_KEY is not set in server/.env.");
  }

  const [genreList, providerList] = await Promise.all([
    getGenres(),
    args.providers.length ? getProviders(args.region) : Promise.resolve([]),
  ]);

  const genreIds = resolveNames(args.genres, genreList, "genre");
  const providerIds = resolveNames(args.providers, providerList, "provider");
  const genreNameById = new Map(genreList.map((g) => [g.id, g.name]));

  console.log(
    `🔎 TMDB discover — region ${args.region}` +
      (args.providers.length ? `, on ${args.providers.join(" / ")}` : "") +
      (args.genres.length ? `, genre ${args.genres.join(" / ")}` : "") +
      (args.country ? `, made in ${args.country}` : "") +
      (args.language ? `, in ${args.language}` : "") +
      `, ${args.pages} page(s)`
  );

  const rows = [];
  const seen = new Set();
  let failures = 0;
  let consecutiveFailures = 0;
  let lastFailure = null;

  for (let page = 1; page <= args.pages; page++) {
    let data;
    try {
      data = await discoverMovies({
        page,
        watch_region: args.region,
        with_watch_providers: providerIds.join("|") || undefined,
        with_genres: genreIds.join(",") || undefined,
        // watch_region only says where a film is *available*. Origin country
        // and original language select the cinema itself — without one of them
        // a popularity sort returns global hits, not local ones.
        with_origin_country: args.country || undefined,
        with_original_language: args.language || undefined,
        sort_by: "popularity.desc",
      });
    } catch (err) {
      // One bad page should cost 20 titles, not the whole run — TMDB returns
      // intermittent 503s that outlast the client's backoff. Skip and carry on,
      // but give up if it is properly down rather than grinding through
      // hundreds of failures.
      failures++;
      consecutiveFailures++;
      lastFailure = err.message;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(`
⚠️  Gave up at page ${page}: ${err.message}`);
        console.warn(`   ${consecutiveFailures} pages failed in a row — TMDB looks unavailable.`);
        break;
      }
      continue;
    }
    consecutiveFailures = 0;

    if (page === 1) {
      const available = Math.min(data.total_results, data.total_pages * PAGE_SIZE);
      console.log(`   ${data.total_results.toLocaleString()} match; taking up to ${Math.min(args.pages * PAGE_SIZE, available)}`);
    }
    if (!data.results?.length) break;

    for (const m of data.results) {
      const key = m.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      let runtime = null;
      let certification = null;
      if (args.details) {
        const { getTitleDetails, getCertification } = await import("../src/services/tmdb.js");
        const details = await getTitleDetails(m.id);
        runtime = details.runtime || null;
        certification = await getCertification(m.id, args.region).catch(() => null);
      }

      rows.push({
        title: m.title,
        description: m.overview || "No description available.",
        contentType: "movie",
        // Title.genre is a single string but TMDB returns several. When the
        // caller filtered by genre, label the row with the genre they asked
        // for — otherwise a --genre Horror import fills the catalog with rows
        // labelled Thriller, because that happened to be TMDB's first id.
        genre: labelGenre(m.genre_ids, genreIds, genreNameById),
        releaseYear: Number((m.release_date || "").slice(0, 4)) || null,
        rating: certification || "NR",
        durationMinutes: runtime,
        thumbnailUrl:
          imageUrl(m.backdrop_path, "w780") || "linear-gradient(135deg, #241B2E, #17141A)",
        heroImageUrl: imageUrl(m.backdrop_path, "original"),
        playbackUrl: args.playback,
        isOriginal: false,
      });
    }

    process.stdout.write(`\r   fetched ${rows.length} titles…`);
  }
  process.stdout.write("\n");

  if (failures) {
    console.log(`   ${failures} page(s) failed and were skipped — last: ${lastFailure}`);
  }

  // releaseYear is NOT NULL; a title TMDB has no date for cannot be stored.
  const usable = rows.filter((r) => r.releaseYear !== null);
  const dropped = rows.length - usable.length;
  if (dropped) console.log(`   skipped ${dropped} with no release date`);

  if (args.out) {
    const render = (list) =>
      list.map((r) => `-- ${r.title} (${r.releaseYear})\n${toInsert(r)}`).join("\n\n") + "\n";

    if (!args.chunk) {
      fs.writeFileSync(args.out, render(usable));
      console.log(`\n✅ Wrote ${usable.length} INSERTs to ${args.out}`);
    } else {
      // A multi-megabyte file will not paste into a browser SQL console, so
      // split it into pieces that will.
      const stem = args.out.replace(/\.sql$/i, "");
      let part = 0;
      for (let i = 0; i < usable.length; i += args.chunk) {
        part++;
        fs.writeFileSync(`${stem}-${part}.sql`, render(usable.slice(i, i + args.chunk)));
      }
      console.log(`\n✅ Wrote ${usable.length} INSERTs across ${part} files: ${stem}-1.sql …`);
    }
    console.log("   Run them against your database — they only insert, nothing is cleared.");
    return;
  }

  const existing = new Set(
    (await prisma.title.findMany({ select: { title: true } })).map((t) => t.title.toLowerCase())
  );
  const fresh = usable.filter((r) => !existing.has(r.title.toLowerCase()));

  if (fresh.length === 0) {
    console.log("\n✅ Nothing new — every match is already in the catalog.");
    return;
  }

  const result = await prisma.title.createMany({ data: fresh });
  console.log(`\n✅ Imported ${result.count} titles (${usable.length - fresh.length} already present)`);
  if (!args.playback) {
    console.log("⚠️  No --playback URL was given, so none of these will play.");
  }
}

main()
  .catch((err) => {
    console.error(`\n❌ ${err.message}`);
    if (/Unknown option|--pages/.test(err.message)) console.error(USAGE);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
