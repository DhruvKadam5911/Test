import prisma from "../config/db.js";
import { resolvePlaybackUrl } from "../services/videoProvider.js";

// The card-shaped projection. ContentCard consumes /titles, /titles/trending and
// /titles/search alike, so all three must select exactly this — diverging them
// breaks one of the three silently. See docs/schema.md.
const CARD_FIELDS = {
  id: true,
  title: true,
  thumbnailUrl: true,
  heroImageUrl: true,
  genre: true,
  releaseYear: true,
  contentType: true,
  rating: true,
  isOriginal: true,
};

// Guards against a client asking for the whole catalog in one response.
const MAX_LIMIT = 100;


// GET /titles
export async function getTitles(req, res) {
  try {
    const { genre, contentType, isOriginal, limit = 20, offset = 0 } = req.query;

    const where = {};
    if (genre) where.genre = { equals: genre, mode: "insensitive" };
    if (contentType) where.contentType = contentType;
    if (isOriginal !== undefined) where.isOriginal = isOriginal === "true";

    const titles = await prisma.title.findMany({
      where,
      take: Math.min(Number(limit) || 20, MAX_LIMIT),
      skip: Number(offset),
      orderBy: { createdAt: "desc" },
      select: CARD_FIELDS,
    });

    return res.status(200).json(titles);
  } catch (error) {
    console.error("getTitles error:", error);
    return res.status(500).json({ error: "Failed to fetch titles." });
  }
}

// GET /titles/trending
export async function getTrending(req, res) {
  try {
    const trending = await prisma.title.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: CARD_FIELDS,
    });

    return res.status(200).json(trending);
  } catch (error) {
    console.error("getTrending error:", error);
    return res.status(500).json({ error: "Failed to fetch trending titles." });
  }
}

// GET /titles/search?q=
export async function searchTitles(req, res) {
  try {
    const { q, limit = 40 } = req.query;
    const query = String(q || "").trim();

    if (query.length < 2) {
      // Matching on one character would scan the whole catalog for nothing useful.
      return res.status(200).json([]);
    }

    const titles = await prisma.title.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { genre: { contains: query, mode: "insensitive" } },
        ],
      },
      take: Math.min(Number(limit) || 40, MAX_LIMIT),
      // Exact-ish matches first would need a raw query; recency is a reasonable
      // stand-in and matches how the rest of the API orders.
      orderBy: { createdAt: "desc" },
      select: CARD_FIELDS,
    });

    return res.status(200).json(titles);
  } catch (error) {
    console.error("searchTitles error:", error);
    return res.status(500).json({ error: "Failed to search titles." });
  }
}

// GET /titles/genres
export async function getGenreList(req, res) {
  try {
    // Lets the client build one row per genre without pulling the catalog down
    // to group it in the browser.
    const grouped = await prisma.title.groupBy({
      by: ["genre"],
      _count: { genre: true },
      orderBy: { _count: { genre: "desc" } },
    });

    return res.status(200).json(
      grouped.map((g) => ({ genre: g.genre, count: g._count.genre }))
    );
  } catch (error) {
    console.error("getGenreList error:", error);
    return res.status(500).json({ error: "Failed to fetch genres." });
  }
}

// GET /titles/:id
export async function getTitleById(req, res) {
  try {
    const { id } = req.params;

    const title = await prisma.title.findUnique({
      where: { id },
      include: {
        seasons: {
          orderBy: { seasonNumber: "asc" },
          select: {
            id: true,
            seasonNumber: true,
            synopsis: true,
            episodes: {
              orderBy: { episodeNumber: "asc" },
              select: {
                id: true,
                episodeNumber: true,
                title: true,
                description: true,
                durationMinutes: true,
                thumbnailUrl: true,
                // Note: playbackUrl excluded for privacy & performance
              },
            },
          },
        },
      },
    });

    if (!title) {
      return res.status(404).json({ error: "Title not found." });
    }

    // Omit top-level playbackUrl from general details
    const { playbackUrl, ...publicTitleDetails } = title;

    return res.status(200).json(publicTitleDetails);
  } catch (error) {
    console.error("getTitleById error:", error);
    return res.status(500).json({ error: "Failed to fetch title details." });
  }
}

// GET /titles/:id/playback (Requires Auth)
export async function getPlaybackUrl(req, res) {
  try {
    const { id } = req.params;
    const { episodeId } = req.query;

    const title = await prisma.title.findUnique({
      where: { id },
    });

    if (!title) {
      return res.status(404).json({ error: "Title not found." });
    }

    if (title.contentType === "movie") {
      const playbackUrl = await resolvePlaybackUrl(title.playbackUrl);
      return res.status(200).json({ playbackUrl });
    }

    // Series playback
    if (!episodeId) {
      return res.status(400).json({ error: "Query parameter 'episodeId' is required for series playback." });
    }

    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
    });

    if (!episode) {
      return res.status(404).json({ error: "Episode not found." });
    }

    const playbackUrl = await resolvePlaybackUrl(episode.playbackUrl);
    return res.status(200).json({ playbackUrl });
  } catch (error) {
    console.error("getPlaybackUrl error:", error);
    return res.status(500).json({ error: "Failed to fetch playback stream URL." });
  }
}
