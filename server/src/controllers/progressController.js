import prisma from "../config/db.js";

// POST /progress (Requires Auth)
export async function updateProgress(req, res) {
  try {
    const userId = req.user.id;
    const { titleId, episodeId, progressSeconds, completed = false } = req.body;

    if (!titleId || progressSeconds === undefined) {
      return res.status(400).json({ error: "Missing required fields: titleId and progressSeconds." });
    }

    // Find existing progress
    const existing = await prisma.watchProgress.findFirst({
      where: {
        userId,
        titleId,
        episodeId: episodeId || null,
      },
    });

    let progress;
    if (existing) {
      progress = await prisma.watchProgress.update({
        where: { id: existing.id },
        data: {
          progressSeconds: Number(progressSeconds),
          completed: Boolean(completed),
          updatedAt: new Date(),
        },
      });
    } else {
      progress = await prisma.watchProgress.create({
        data: {
          userId,
          titleId,
          episodeId: episodeId || null,
          progressSeconds: Number(progressSeconds),
          completed: Boolean(completed),
        },
      });
    }

    return res.status(200).json(progress);
  } catch (error) {
    console.error("updateProgress error:", error);
    return res.status(500).json({ error: "Failed to save watch progress." });
  }
}

// GET /progress/continue-watching (Requires Auth)
export async function getContinueWatching(req, res) {
  try {
    const userId = req.user.id;

    const items = await prisma.watchProgress.findMany({
      where: {
        userId,
        completed: false,
      },
      orderBy: { updatedAt: "desc" },
      include: {
        title: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            heroImageUrl: true,
            genre: true,
            contentType: true,
            rating: true,
          },
        },
        episode: {
          select: {
            id: true,
            title: true,
            episodeNumber: true,
            durationMinutes: true,
          },
        },
      },
    });

    return res.status(200).json(items);
  } catch (error) {
    console.error("getContinueWatching error:", error);
    return res.status(500).json({ error: "Failed to fetch continue watching list." });
  }
}
