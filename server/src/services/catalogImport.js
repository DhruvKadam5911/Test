import prisma from "../config/db.js";
import { discoverMovies, discoverTv, getGenres, getProviders, imageUrl } from "./tmdb.js";

/*
 * Importing TMDB titles into the catalog.
 *
 * Lives here rather than in the CLI so the scheduled refresh can run the same
 * logic. The API can reach both TMDB and the database, which a developer
 * machine behind a restrictive network may not — that is the whole reason the
 * refresh runs server-side instead of someone pasting SQL.
 *
 * Every call is idempotent: titles already in the catalog are skipped, so the
 * same slice can be re-imported safely and a cron can run as often as it likes.
 */

// TMDB refuses discover past page 500, whatever total_pages claims. That is a
// hard 10,000-row ceiling *per query* — the only way past it is to ask a
// narrower question (one language, one genre, one year at a time), which is
// what the backfill driver does.
export const MAX_PAGE = 500;
const PAGE_SIZE = 20;

/** The requested genre if the film has it, otherwise TMDB's own first choice. */
function labelGenre(ids = [], requestedIds, nameById) {
  const requested = ids.find((id) => requestedIds.includes(id));
  return nameById.get(requested ?? ids[0]) || "Uncategorised";
}

function resolveNames(names, catalogue, kind) {
  return names.map((name) => {
    const match = catalogue.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!match) throw new Error(`Unknown ${kind} "${name}".`);
    return match.id;
  });
}

/**
 * Films and series come back from different endpoints with different field
 * names. Normalising here keeps the rest of the import identical for both.
 */
function normalise(item, media) {
  return media === "tv"
    ? { name: item.name, date: item.first_air_date, contentType: "series" }
    : { name: item.title, date: item.release_date, contentType: "movie" };
}

/**
 * Import one slice of TMDB's discover results.
 *
 * `fromPage`/`pages` exist because a serverless invocation has a hard time
 * limit — a few pages per call, driven repeatedly, is what makes a large
 * backlog possible without a long-running process.
 *
 * @param {object} options
 * @param {"movie"|"tv"} options.media — which TMDB catalogue to walk.
 * @param {string[]} options.providers — empty means no platform filter at all,
 *   which is how the backfill reaches films that are not on the four services
 *   the nightly cron watches.
 */
export async function importSlice({
  media = "movie",
  providers = [],
  genres = [],
  language = null,
  country = null,
  region = "IN",
  year = null,
  fromPage = 1,
  pages = 3,
  playbackUrl = null,
} = {}) {
  const [genreList, providerList] = await Promise.all([
    getGenres(media),
    providers.length ? getProviders(region, media) : Promise.resolve([]),
  ]);

  const genreIds = resolveNames(genres, genreList, "genre");
  const providerIds = resolveNames(providers, providerList, "provider");
  const genreNameById = new Map(genreList.map((g) => [g.id, g.name]));

  const discover = media === "tv" ? discoverTv : discoverMovies;
  // The date field is named after the medium, and so is the year filter.
  const yearFilter = year
    ? media === "tv"
      ? { first_air_date_year: year }
      : { primary_release_year: year }
    : {};

  const rows = [];
  let scanned = 0;
  let failedPages = 0;
  let totalAvailable = 0;
  const lastPage = Math.min(fromPage + pages - 1, MAX_PAGE);

  for (let page = fromPage; page <= lastPage; page++) {
    let data;
    try {
      data = await discover({
        page,
        watch_region: region,
        with_watch_providers: providerIds.join("|") || undefined,
        with_genres: genreIds.join(",") || undefined,
        with_origin_country: country || undefined,
        with_original_language: language || undefined,
        sort_by: "popularity.desc",
        ...yearFilter,
      });
    } catch {
      // One flaky page should not fail the whole slice; TMDB 503s in bursts.
      failedPages++;
      continue;
    }

    totalAvailable = data.total_results ?? 0;
    if (!data.results?.length) break;

    for (const item of data.results) {
      scanned++;
      const { name, date, contentType } = normalise(item, media);
      if (!name) continue;

      const releaseYear = Number((date || "").slice(0, 4));
      // releaseYear is NOT NULL, so a title TMDB has no date for cannot be stored.
      if (!releaseYear) continue;

      rows.push({
        title: name,
        description: item.overview || "No description available.",
        contentType,
        genre: labelGenre(item.genre_ids, genreIds, genreNameById),
        releaseYear,
        rating: "NR",
        durationMinutes: null,
        thumbnailUrl:
          imageUrl(item.backdrop_path, "w780") || "linear-gradient(135deg, #241B2E, #17141A)",
        heroImageUrl: imageUrl(item.backdrop_path, "original"),
        playbackUrl,
        isOriginal: false,
      });
    }
  }

  if (rows.length === 0) {
    return { added: 0, skipped: 0, scanned, failedPages, totalAvailable, lastPage, pagesRemaining: 0 };
  }

  // Compare against what is already stored rather than trusting TMDB's ordering
  // to be stable between runs.
  const existing = new Set(
    (
      await prisma.title.findMany({
        where: { title: { in: rows.map((r) => r.title) } },
        select: { title: true },
      })
    ).map((t) => t.title.toLowerCase())
  );

  const seen = new Set();
  const fresh = rows.filter((r) => {
    const key = r.title.toLowerCase();
    if (existing.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result = fresh.length ? await prisma.title.createMany({ data: fresh }) : { count: 0 };

  return {
    added: result.count,
    skipped: rows.length - fresh.length,
    scanned,
    failedPages,
    totalAvailable,
    lastPage,
    pagesRemaining: Math.max(0, Math.min(Math.ceil(totalAvailable / PAGE_SIZE), MAX_PAGE) - lastPage),
  };
}
