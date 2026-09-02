import prisma from "../config/db.js";
import {
  searchSongs as saavnSearchSongs,
  fetchTrending as saavnFetchTrending,
  searchAlbums as saavnSearchAlbums,
  fetchRelated as saavnFetchRelated,
} from "../services/saavn.js";
import {
  searchVideos as ytSearchVideos,
  fetchTrending as ytFetchTrending,
  searchRelated as ytSearchRelated,
  searchAlbums as ytSearchAlbums,
} from "../services/youtube.js";
import { fetchLyrics } from "../services/lyrics.js";

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
      params.push(
        t.title,
        t.artist,
        t.streamUrl || t.audioUrl || null,
        t.artworkUrl,
        t.durationSec || t.durationSeconds || null,
        t.genre || null,
        t.source || "saavn",
        t.sourceId || t.id
      );
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
    console.warn("storeTracks cache notice:", err?.message || err);
  }
}

// GET /music/tracks — what the network is publishing and streaming right now.
export async function getTracks(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, MAX_LIMIT);

    // 1. Try Direct 320kbps Saavn stream source
    try {
      const trending = await saavnFetchTrending({ limit });
      if (trending && trending.length) {
        await storeTracks(trending);
        return res.status(200).json(trending);
      }
    } catch (err) {
      console.warn("Saavn trending notice, falling back to YouTube:", err.message);
    }

    // 2. Fallback to YouTube
    try {
      const ytTrending = await ytFetchTrending({ limit });
      if (ytTrending && ytTrending.length) {
        await storeTracks(ytTrending);
        return res.status(200).json(ytTrending);
      }
    } catch (err) {
      console.warn("YouTube trending notice:", err.message);
    }

    // 3. Fallback to cached tracks
    const tracks = await prisma.$queryRaw`
      SELECT id, title, artist, "audioUrl" as "streamUrl", "artworkUrl", "durationSeconds" as "durationSec", genre, source, "sourceId"
      FROM "Track"
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
    // 1. Search direct 320kbps streams via Saavn
    try {
      const saavnResults = await saavnSearchSongs(query, { limit });
      if (saavnResults && saavnResults.length) {
        await storeTracks(saavnResults);
        return res.status(200).json(saavnResults);
      }
    } catch (err) {
      console.warn("Saavn search error:", err.message);
    }

    // 2. Fallback to YouTube
    try {
      const ytResults = await ytSearchVideos({ query, limit });
      if (ytResults && ytResults.length) {
        await storeTracks(ytResults);
        return res.status(200).json(ytResults);
      }
    } catch (err) {
      console.warn("YouTube search error:", err.message);
    }

    // 3. Fallback to cached tracks
    const cached = await prisma.$queryRaw`
      SELECT id, title, artist, "audioUrl" as "streamUrl", "artworkUrl", "durationSeconds" as "durationSec", genre, source, "sourceId"
      FROM "Track"
      WHERE (title ILIKE ${`%${query}%`} OR artist ILIKE ${`%${query}%`})
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

  if (!title && !artist && !exclude) return res.status(200).json([]);

  const limit = Math.min(Number(req.query.limit) || 25, MAX_LIMIT);

  try {
    // 1. Try Saavn related / artist search for direct 320kbps streams
    try {
      const related = await saavnFetchRelated(artist || title, { limit });
      if (related && related.length) {
        const filtered = related.filter((t) => t.sourceId !== exclude && t.id !== exclude);
        if (filtered.length) {
          await storeTracks(filtered);
          return res.status(200).json(filtered);
        }
      }
    } catch (err) {
      console.warn("Saavn related notice:", err.message);
    }

    // 2. Fallback to YouTube related
    const found = await ytSearchRelated({ title, artist, exclude, limit });
    await storeTracks(found);
    return res.status(200).json(found);
  } catch (error) {
    console.error("relatedTracks error:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch related tracks." });
  }
}

// GET /music/albums?q=
export async function searchMusicAlbums(req, res) {
  const query = String(req.query.q || "").trim();
  if (query.length < 2) return res.status(200).json([]);

  const limit = Math.min(Number(req.query.limit) || 25, MAX_LIMIT);

  try {
    // 1. Try Saavn albums
    try {
      const saavnAlbums = await saavnSearchAlbums(query, { limit });
      if (saavnAlbums && saavnAlbums.length) {
        return res.status(200).json(saavnAlbums);
      }
    } catch (err) {
      console.warn("Saavn album search error:", err.message);
    }

    // 2. Fallback to YouTube albums
    const albums = await ytSearchAlbums({ query, limit });
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
       WHERE genre IS NOT NULL
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

// GET /music/lyrics?track=&artist=&duration=
export async function getLyrics(req, res) {
  const track = String(req.query.track || "").trim();
  const artist = String(req.query.artist || "").trim();
  const duration = req.query.duration;

  if (!track) {
    return res.status(200).json({ synced: [], plain: "", hasSynced: false });
  }

  try {
    const data = await fetchLyrics({ track, artist, duration });
    return res.status(200).json(data);
  } catch (error) {
    console.error("getLyrics error:", error);
    return res.status(500).json({ error: "Failed to fetch lyrics." });
  }
}
