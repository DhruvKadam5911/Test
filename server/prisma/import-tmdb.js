// Must be first: the TMDB service reads process.env, and ESM evaluates imports
// before this module's body.
import "dotenv/config";

import prisma from "../src/config/db.js";
import {
  searchTitle,
  getTitleDetails,
  getCertification,
  imageUrl,
  isTmdbConfigured,
} from "../src/services/tmdb.js";

/*
 * Import a real film from TMDB into the catalog.
 *
 *   node prisma/import-tmdb.js "Interstellar"
 *   node prisma/import-tmdb.js "Dune" --year 2021 --playback https://…/dune.mp4
 *
 * Unlike seed.js this only ever inserts — it never clears the database.
 *
 * Movies only. A series would need a playbackUrl per episode (Episode.playbackUrl
 * is required in the schema) and TMDB has no streams to supply, so importing one
 * would mean inventing data for every episode.
 */

const USAGE = `
Usage: node prisma/import-tmdb.js "<title>" [options]

  --year <yyyy>      Narrow the search, for remakes
  --playback <url>   Stream URL for this title
  --original         Mark it as an Onion Original
  --force            Import even if a title with this name already exists
`;

function parseArgs(argv) {
  const args = { query: null, year: null, playback: null, original: false, force: false };
  const rest = argv.slice(2);

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--year") args.year = rest[++i];
    else if (arg === "--playback") args.playback = rest[++i];
    else if (arg === "--original") args.original = true;
    else if (arg === "--force") args.force = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else if (args.query === null) args.query = arg;
    else throw new Error(`Unexpected argument: ${arg}. Quote titles containing spaces.`);
  }

  if (!args.query) throw new Error("A title to search for is required.");
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!isTmdbConfigured()) {
    throw new Error(
      "TMDB_API_KEY is not set in server/.env. Get a key at https://www.themoviedb.org/settings/api"
    );
  }

  console.log(`🔎 Searching TMDB for "${args.query}"${args.year ? ` (${args.year})` : ""}…`);
  const results = await searchTitle(args.query, { year: args.year });

  if (results.length === 0) {
    throw new Error(`Nothing on TMDB matched "${args.query}". Try the exact title, or add --year.`);
  }

  const match = results[0];
  if (results.length > 1) {
    // Taking the top result is a guess, so show what else it could have been.
    console.log(`   ${results.length} matches; taking the first. Others:`);
    for (const r of results.slice(1, 4)) {
      console.log(`     - ${r.title} (${(r.release_date || "?").slice(0, 4)})`);
    }
  }

  const details = await getTitleDetails(match.id);
  const certification = await getCertification(match.id);

  const existing = await prisma.title.findFirst({ where: { title: details.title } });
  if (existing && !args.force) {
    throw new Error(
      `"${details.title}" is already in the catalog (${existing.id}). Pass --force to add it anyway.`
    );
  }

  if (!details.backdrop_path) {
    // Cards and the hero are landscape; without a backdrop they fall back to a
    // gradient, which is the look this import exists to replace.
    console.warn("⚠️  TMDB has no backdrop for this title — it will render as a gradient.");
  }
  if (!args.playback) {
    console.warn("⚠️  No --playback URL given. The title will import but will not play.");
  }

  const created = await prisma.title.create({
    data: {
      title: details.title,
      description: details.overview || "No description available.",
      contentType: "movie",
      // Our schema carries one genre; TMDB returns several, ordered by relevance.
      genre: details.genres?.[0]?.name || "Uncategorised",
      releaseYear: Number((details.release_date || "").slice(0, 4)) || new Date().getFullYear(),
      rating: certification || "NR",
      durationMinutes: details.runtime || null,
      thumbnailUrl: imageUrl(details.backdrop_path, "w780") || "linear-gradient(135deg, #241B2E, #17141A)",
      heroImageUrl: imageUrl(details.backdrop_path, "original"),
      playbackUrl: args.playback,
      isOriginal: args.original,
    },
  });

  console.log(`\n✅ Imported "${created.title}"`);
  console.log(`   id            ${created.id}`);
  console.log(`   genre         ${created.genre}`);
  console.log(`   year          ${created.releaseYear}`);
  console.log(`   rating        ${created.rating}`);
  console.log(`   duration      ${created.durationMinutes ?? "—"} min`);
  console.log(`   artwork       ${created.thumbnailUrl.startsWith("http") ? "TMDB backdrop" : "gradient fallback"}`);
  console.log(`   playback      ${created.playbackUrl || "none — will not play"}`);
}

main()
  .catch((err) => {
    console.error(`\n❌ ${err.message}`);
    if (/required|Unknown option|Unexpected argument/.test(err.message)) console.error(USAGE);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
