import prisma from "../config/db.js";

/*
 * Music tracks.
 *
 * The table and its columns are created by GET /admin/reindex alongside the
 * catalog's own, for the same reason: Prisma migrations cannot run from a
 * machine with no route to Postgres on 5432.
 *
 * Returns an empty list rather than an error when nothing has been added, so
 * the player can say so instead of looking broken.
 */

const MAX_LIMIT = 200;

// GET /music/tracks
export async function getTracks(req, res) {
  try {
    const genre = req.query.genre || null;
    const limit = Math.min(Number(req.query.limit) || 100, MAX_LIMIT);
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const tracks = genre
      ? await prisma.$queryRaw`
          SELECT id, title, artist, "audioUrl", "artworkUrl", "durationSeconds", genre, source
          FROM "Track" WHERE lower(genre) = lower(${genre})
          ORDER BY "createdAt" DESC LIMIT ${limit} OFFSET ${offset}`
      : await prisma.$queryRaw`
          SELECT id, title, artist, "audioUrl", "artworkUrl", "durationSeconds", genre, source
          FROM "Track"
          ORDER BY "createdAt" DESC LIMIT ${limit} OFFSET ${offset}`;

    return res.status(200).json(tracks);
  } catch (error) {
    // The table not existing yet is the ordinary case before the first deploy
    // that runs /admin/reindex, and is not worth a 500.
    if (/does not exist/i.test(error.message)) return res.status(200).json([]);
    console.error("getTracks error:", error);
    return res.status(500).json({ error: "Failed to fetch tracks." });
  }
}

// GET /music/genres
export async function getMusicGenres(req, res) {
  try {
    const genres = await prisma.$queryRawUnsafe(
      `SELECT genre, count(*)::int AS count FROM "Track"
       WHERE genre IS NOT NULL GROUP BY genre ORDER BY count DESC`
    );
    return res.status(200).json(genres);
  } catch (error) {
    if (/does not exist/i.test(error.message)) return res.status(200).json([]);
    console.error("getMusicGenres error:", error);
    return res.status(500).json({ error: "Failed to fetch music genres." });
  }
}
