import prisma from "../config/db.js";

/*
 * Music tracks.
 *
 * The table is created by GET /admin/reindex alongside the catalog's own
 * columns, for the same reason: Prisma migrations cannot run from a machine
 * with no route to Postgres on 5432.
 *
 * Returns an empty list rather than an error when nothing has been added, so
 * the player can say so instead of looking broken.
 */

// GET /music/tracks
export async function getTracks(req, res) {
  try {
    const tracks = await prisma.$queryRawUnsafe(
      `SELECT id, title, artist, "audioUrl", "artworkUrl", "durationSeconds"
       FROM "Track" ORDER BY "createdAt" DESC LIMIT 200`
    );
    return res.status(200).json(tracks);
  } catch (error) {
    // The table not existing yet is the ordinary case before the first deploy
    // that runs /admin/reindex, and is not worth a 500.
    if (/does not exist/i.test(error.message)) return res.status(200).json([]);
    console.error("getTracks error:", error);
    return res.status(500).json({ error: "Failed to fetch tracks." });
  }
}
