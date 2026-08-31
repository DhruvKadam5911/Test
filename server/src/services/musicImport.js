import prisma from "../config/db.js";
import {
  AUDIUS_GENRES,
  ARCHIVE_COLLECTIONS,
  fetchAudiusTracks,
  fetchArchiveItems,
  resolveArchiveTrack,
} from "./musicSources.js";

/*
 * Importing tracks into the catalog.
 *
 * Same shape as the film import, and for the same reasons: it runs on the
 * server, it takes a slice at a time because a serverless invocation has a hard
 * time limit, and it is idempotent — every track carries the id its source gave
 * it, and a unique index on (source, sourceId) means re-running a slice inserts
 * nothing twice.
 */

// Audius serves 100 per request; the Archive is two calls per item, so its
// pages are smaller or the slice runs out of time.
const AUDIUS_PAGE = 100;
const ARCHIVE_PAGE = 25;

async function insertTracks(rows) {
  if (!rows.length) return 0;

  const params = [];
  const tuples = rows.map((row) => {
    const start = params.length;
    params.push(
      row.title, row.artist, row.audioUrl, row.artworkUrl,
      row.durationSeconds, row.genre, row.source, row.sourceId
    );
    const p = (n) => `$${start + n}`;
    return `(gen_random_uuid()::text, ${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, NOW())`;
  });

  // The unique index does the de-duplicating, so a slice that overlaps an
  // earlier one is a no-op rather than an error.
  const count = await prisma.$executeRawUnsafe(
    `INSERT INTO "Track" (id, title, artist, "audioUrl", "artworkUrl", "durationSeconds", genre, source, "sourceId", "createdAt")
     VALUES ${tuples.join(", ")}
     ON CONFLICT (source, "sourceId") DO NOTHING`,
    ...params
  );
  return count;
}

/**
 * Import one slice.
 *
 * @param {{source?: "audius"|"archive", genre?: string, fromPage?: number, pages?: number}} options
 */
export async function importMusicSlice({ source = "audius", genre = null, fromPage = 1, pages = 2 } = {}) {
  const rows = [];
  let scanned = 0;
  let failedPages = 0;

  if (source === "audius") {
    const genres = genre ? [genre] : AUDIUS_GENRES;
    for (const g of genres) {
      for (let page = fromPage; page < fromPage + pages; page++) {
        try {
          const tracks = await fetchAudiusTracks({
            genre: g,
            limit: AUDIUS_PAGE,
            offset: (page - 1) * AUDIUS_PAGE,
          });
          scanned += tracks.length;
          rows.push(...tracks);
          // Trending runs out well before the offset does.
          if (tracks.length < AUDIUS_PAGE) break;
        } catch {
          failedPages++;
        }
      }
    }
  } else {
    const collections = genre
      ? ARCHIVE_COLLECTIONS.filter((c) => c.collection === genre)
      : ARCHIVE_COLLECTIONS;

    for (const { collection, genre: label } of collections) {
      for (let page = fromPage; page < fromPage + pages; page++) {
        let items;
        try {
          items = await fetchArchiveItems({ collection, page, rows: ARCHIVE_PAGE });
        } catch {
          failedPages++;
          continue;
        }
        if (!items.length) break;
        scanned += items.length;

        // Resolved together rather than one after another: each is its own
        // request, and in series a page of 25 would not finish in time.
        const resolved = await Promise.all(items.map((i) => resolveArchiveTrack(i, label)));
        rows.push(...resolved.filter(Boolean));
      }
    }
  }

  const usable = rows.filter((r) => r.title && r.audioUrl);

  // Dropped here as well as by the index, so one batch cannot carry the same
  // track twice — ON CONFLICT cannot resolve a duplicate inside its own INSERT.
  const seen = new Set();
  const unique = usable.filter((r) => {
    const key = `${r.source}:${r.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let added = 0;
  for (let i = 0; i < unique.length; i += 200) {
    added += await insertTracks(unique.slice(i, i + 200));
  }

  const [{ count: total }] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM "Track"');

  return { source, added, scanned, skipped: unique.length - added, failedPages, total };
}
