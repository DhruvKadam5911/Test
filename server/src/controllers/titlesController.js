import prisma from "../config/db.js";
import { resolvePlaybackUrl } from "../services/videoProvider.js";

// GET /titles
export async function getTitles(req, res) {
  try {
    const { genre, contentType, limit = 20, offset = 0 } = req.query;

    const where = {};
    if (genre) where.genre = { equals: genre, mode: "insensitive" };
    if (contentType) where.contentType = contentType;

    const titles = await prisma.title.findMany({
      where,
      take: Number(limit),
      skip: Number(offset),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        heroImageUrl: true,
        genre: true,
        releaseYear: true,
        contentType: true,
        rating: true,
        isOriginal: true,
      },
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
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        heroImageUrl: true,
        genre: true,
        releaseYear: true,
        contentType: true,
        rating: true,
        isOriginal: true,
      },
    });

    return res.status(200).json(trending);
  } catch (error) {
    console.error("getTrending error:", error);
    return res.status(500).json({ error: "Failed to fetch trending titles." });
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
