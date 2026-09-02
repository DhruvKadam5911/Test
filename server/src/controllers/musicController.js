import prisma from "../config/db.js";
import { searchVideos, fetchTrending, searchRelated, searchAlbums } from "../services/youtube.js";

/*
 * Music.
 *
 * One catalogue answers `/music/*`: YouTube, through InnerTube — see
 * services/youtube.js. There was a second source (PeerTube) and a selector in
 * front of both; it is gone, along with everything it had indexed. Nothing here
 * branches on a source any more.
 *
 * The Track table is still a cache, but for latency rather than quota: nothing
 * here is metered, so a miss costs a slow request instead of a slice of a daily
 * allowance. Rows are written on the way out so the stream endpoint can find a
 * track by id later without searching for it again.
 *
 * Every read of that cache filters on `source = 'youtube'`. The table outlives
 * the source that wrote to it, and a PeerTube row surfacing here is a track the
 * stream endpoint can no longer resolve — a result that looks fine and refuses
 * to play. `GET /admin/clear-music?source=peertube&apply=true` deletes them for
 * good; this filter is what makes that a tidy-up rather than a prerequisite.
 */

const MAX_LIMIT = 50;

const emptyIfNoTable = (error, res) => {
  if (/does not exist/i.test(error.message)) return res.status(200).json([]);
  return null;
};

async function storeTracks(tracks) {
  if (!tracks || !tracks.length) return;

  try {
    const params = [];
    const tuples = tracks.map((t) => {
      const start = params.length;
      params.push(t.title, t.artist, t.audioUrl, t.artworkUrl, t.durationSeconds, t.genre, t.source, t.sourceId);
      const p = (n) => `$${start + n}`;
      return `(gen_random_uuid()::text, ${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, NOW())`;
    });

    await prisma.$executeRawUnsafe(
      `INSERT INTO "Track" (id, title, artist, "audioUrl", "artworkUrl", "durationSeconds", genre, source, "sourceId", "createdAt")
       VALUES ${tuples.join(", ")}
       ON CONFLICT (source, "sourceId") DO NOTHING`,
      ...params
    );
  } catch (err) {
    // Database caching error shouldn't crash the live network response
    console.warn("storeTracks cache notice:", err?.message || err);
  }
}

// GET /music/tracks — what the network is publishing and watching right now.
export async function getTracks(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, MAX_LIMIT);

    try {
      const trending = await fetchTrending({ limit });
      if (trending.length) {
        await storeTracks(trending);
        return res.status(200).json(trending);
      }
    } catch (error) {
      // The network being slow or unreachable should show the last thing that
      // worked rather than an empty page.
      console.error("getTracks trending error:", error.message);
    }

    const tracks = await prisma.$queryRaw`
      SELECT id, title, artist, "artworkUrl", "durationSeconds", genre, source, "sourceId"
      FROM "Track" WHERE source = 'youtube'
      ORDER BY "createdAt" DESC LIMIT ${limit}`;
    return res.status(200).json(tracks);
  } catch (error) {
    const empty = emptyIfNoTable(error, res);
    if (empty) return empty;
    console.error("getTracks error:", error);
    return res.status(500).json({ error: "Failed to fetch tracks." });
  }
}

// GET /music/search?q=
export async function searchTracks(req, res) {
  const query = String(req.query.q || "").trim();
  if (query.length < 2) return res.status(200).json([]);

  const limit = Math.min(Number(req.query.limit) || 25, MAX_LIMIT);

  try {
    const found = await searchVideos({ query, limit });
    if (found.length) {
      await storeTracks(found);
      return res.status(200).json(found);
    }

    // Nothing from the network: answer from what has been seen before rather
    // than with an empty list.
    const cached = await prisma.$queryRaw`
      SELECT id, title, artist, "artworkUrl", "durationSeconds", genre, source, "sourceId"
      FROM "Track"
      WHERE source = 'youtube'
        AND (title ILIKE ${`%${query}%`} OR artist ILIKE ${`%${query}%`})
      ORDER BY "createdAt" DESC LIMIT ${limit}`;
    return res.status(200).json(cached);
  } catch (error) {
    console.error("searchTracks error:", error);
    return res.status(500).json({ error: error.message || "Failed to search music." });
  }
}

// GET /music/related?title=&artist=&exclude=
export async function relatedTracks(req, res) {
  const title = String(req.query.title || "").trim();
  const artist = String(req.query.artist || "").trim();
  const exclude = String(req.query.exclude || "").trim();
  // An id alone is enough: it seeds YouTube's own radio queue, which is a
  // better answer than searching the words of the title.
  if (!title && !exclude) return res.status(200).json([]);

  const limit = Math.min(Number(req.query.limit) || 25, MAX_LIMIT);

  try {
    const found = await searchRelated({ title, artist, exclude, limit });
    await storeTracks(found);
    return res.status(200).json(found);
  } catch (error) {
    console.error("relatedTracks error:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch related tracks." });
  }
}

/*
 * GET /music/albums?q=
 *
 * A real album search: YouTube Music returns albums with their own ids, artist
 * and cover art, which is one of the things the source it replaced could not
 * answer at all.
 *
 * Albums are not written to the Track table: an album id is not a playable
 * track, and storing it would put rows in there that the stream endpoint would
 * later be asked to play.
 */
export async function searchMusicAlbums(req, res) {
  const query = String(req.query.q || "").trim();
  if (query.length < 2) return res.status(200).json([]);

  const limit = Math.min(Number(req.query.limit) || 25, MAX_LIMIT);

  try {
    const albums = await searchAlbums({ query, limit });
    return res.status(200).json(albums);
  } catch (error) {
    console.error("searchMusicAlbums error:", error);
    return res.status(500).json({ error: error.message || "Failed to search albums." });
  }
}

// GET /music/genres
export async function getMusicGenres(req, res) {
  try {
    const genres = await prisma.$queryRawUnsafe(
      `SELECT genre, count(*)::int AS count FROM "Track"
       WHERE genre IS NOT NULL AND source = 'youtube'
       GROUP BY genre ORDER BY count DESC`
    );
    return res.status(200).json(genres);
  } catch (error) {
    const empty = emptyIfNoTable(error, res);
    if (empty) return empty;
    console.error("getMusicGenres error:", error);
    return res.status(500).json({ error: "Failed to fetch music genres." });
  }
}
