import prisma from "../config/db.js";
import { fetchChart, searchMusic, searchAlbums, searchRelated, titleCore, rankByOriginality, isYoutubeConfigured } from "../services/youtube.js";
import { fetchLyrics, isLyricsConfigured } from "../services/lyrics.js";

/*
 * Music.
 *
 * Tracks are YouTube videos: the catalogue people actually want is there, and
 * the embedded player is the licensed way to reach it. Nothing here handles
 * audio — `sourceId` is a video id and the browser plays it through YouTube.
 *
 * The Track table doubles as a quota cache. A search costs 100 of the 10,000
 * units a day, so a query the catalog can already answer is never sent.
 */

const MAX_LIMIT = 50;
// Below this a stored answer is too thin to be worth serving instead of asking.
const CACHE_HIT_MIN = 8;

const emptyIfNoTable = (error, res) => {
  if (/does not exist/i.test(error.message)) return res.status(200).json([]);
  return null;
};

async function storeTracks(tracks) {
  if (!tracks.length) return;

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
}

// GET /music/tracks — the charts, and what has been searched for before.
export async function getTracks(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, MAX_LIMIT);

    if (isYoutubeConfigured()) {
      try {
        // One quota unit, so this can run on every visit.
        const chart = await fetchChart({ region: req.query.region || "IN", limit });
        await storeTracks(chart);
        return res.status(200).json(chart);
      } catch (error) {
        // Quota gone or YouTube unreachable: fall back to what is stored rather
        // than showing an empty page.
        console.error("getTracks chart error:", error.message);
      }
    }

    const tracks = await prisma.$queryRaw`
      SELECT id, title, artist, "artworkUrl", "durationSeconds", genre, source, "sourceId"
      FROM "Track" ORDER BY "createdAt" DESC LIMIT ${limit}`;
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
    // The catalog first. Every search that has run before is in it, and asking
    // YouTube again would cost a hundredth of the day's quota for the same rows.
    const cached = await prisma.$queryRaw`
      SELECT id, title, artist, "artworkUrl", "durationSeconds", genre, source, "sourceId"
      FROM "Track"
      WHERE source = 'youtube' AND (title ILIKE ${`%${query}%`} OR artist ILIKE ${`%${query}%`})
      ORDER BY "createdAt" DESC LIMIT ${limit}`;

    // Ranked again on the way out: the rows come back in whatever order the
    // table holds them, which throws away the ordering the search paid for.
    if (cached.length >= CACHE_HIT_MIN) return res.status(200).json(rankByOriginality(cached));

    if (!isYoutubeConfigured()) {
      return res.status(503).json({ error: "YOUTUBE_API_KEY is not configured on this deployment." });
    }

    const found = await searchMusic({ query, region: req.query.region || "IN", limit });
    await storeTracks(found);
    return res.status(200).json(found);
  } catch (error) {
    console.error("searchTracks error:", error);
    return res.status(500).json({ error: error.message || "Failed to search music." });
  }
}

// GET /music/genres — kept so the client has one shape to read.
export async function getMusicGenres(req, res) {
  try {
    const genres = await prisma.$queryRawUnsafe(
      `SELECT genre, count(*)::int AS count FROM "Track"
       WHERE genre IS NOT NULL GROUP BY genre ORDER BY count DESC`
    );
    return res.status(200).json(genres);
  } catch (error) {
    const empty = emptyIfNoTable(error, res);
    if (empty) return empty;
    console.error("getMusicGenres error:", error);
    return res.status(500).json({ error: "Failed to fetch music genres." });
  }
}

// GET /music/albums?q=
export async function searchMusicAlbums(req, res) {
  const query = String(req.query.q || "").trim();
  if (query.length < 2) return res.status(200).json([]);

  const limit = Math.min(Number(req.query.limit) || 25, MAX_LIMIT);

  try {
    const cached = await prisma.$queryRaw`
      SELECT id, title, artist, "artworkUrl", "durationSeconds", genre, source, "sourceId"
      FROM "Track"
      WHERE source = 'youtube-playlist' AND (title ILIKE ${`%${query}%`} OR artist ILIKE ${`%${query}%`})
      ORDER BY "createdAt" DESC LIMIT ${limit}`;

    if (cached.length >= CACHE_HIT_MIN) return res.status(200).json(cached);

    if (!isYoutubeConfigured()) {
      return res.status(503).json({ error: "YOUTUBE_API_KEY is not configured on this deployment." });
    }

    // Its own call, and therefore its own hundred units: playlists do not come
    // back from a video search however wide it is asked to be.
    const found = await searchAlbums({ query, region: req.query.region || "IN", limit });
    await storeTracks(found);
    return res.status(200).json(found);
  } catch (error) {
    console.error("searchMusicAlbums error:", error);
    return res.status(500).json({ error: error.message || "Failed to search albums." });
  }
}

// GET /music/related?title=&artist=&exclude=
export async function relatedTracks(req, res) {
  const title = String(req.query.title || "").trim();
  const artist = String(req.query.artist || "").trim();
  const exclude = String(req.query.exclude || "").trim();

  if (!artist && !title) return res.status(200).json([]);

  const limit = Math.min(Number(req.query.limit) || 25, MAX_LIMIT);
  const seed = titleCore(title);

  try {
    // The catalog first, as everywhere else — a search costs a hundredth of the
    // day's quota and this runs every time a track is picked.
    const cached = await prisma.$queryRaw`
      SELECT id, title, artist, "artworkUrl", "durationSeconds", genre, source, "sourceId"
      FROM "Track"
      WHERE source = 'youtube' AND artist ILIKE ${`%${artist}%`} AND "sourceId" <> ${exclude}
      ORDER BY "createdAt" DESC LIMIT ${limit * 2}`;

    // Other copies of the same song are the one thing this must not return.
    const usable = rankByOriginality(cached).filter((t) => !seed || titleCore(t.title) !== seed);
    if (usable.length >= CACHE_HIT_MIN) return res.status(200).json(usable.slice(0, limit));

    if (!isYoutubeConfigured()) return res.status(200).json(usable);

    const found = await searchRelated({ title, artist, exclude, region: req.query.region || "IN", limit });
    await storeTracks(found);
    return res.status(200).json(found);
  } catch (error) {
    console.error("relatedTracks error:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch related tracks." });
  }
}

// GET /music/lyrics?title=&artist=
export async function getLyrics(req, res) {
  const title = String(req.query.title || "").trim();
  const artist = String(req.query.artist || "").trim();
  if (!title) return res.status(400).json({ error: "A title is required." });

  if (!isLyricsConfigured()) {
    return res.status(503).json({
      error: "Lyrics need a Musixmatch API key (MUSIXMATCH_API_KEY). No free source returns full lyrics without one.",
    });
  }

  try {
    // A YouTube title carries the film, the cast and the label; the song is the
    // part before all of that, which is what a lyrics service can match on.
    const lyrics = await fetchLyrics({
      track: titleCore(title) || title,
      artist: artist.replace(/vevo$/i, "").trim(),
    });

    if (!lyrics) return res.status(404).json({ error: "No lyrics found for this one." });
    return res.status(200).json(lyrics);
  } catch (error) {
    console.error("getLyrics error:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch lyrics." });
  }
}
