import prisma from "../config/db.js";

// POST /mylist (Requires Auth)
export async function addToMyList(req, res) {
  try {
    const userId = req.user.id;
    const { titleId } = req.body;

    if (!titleId) {
      return res.status(400).json({ error: "Missing required field: titleId." });
    }

    // Check if title exists
    const title = await prisma.title.findUnique({
      where: { id: titleId },
    });

    if (!title) {
      return res.status(404).json({ error: "Title not found." });
    }

    // Check if already in list
    const existing = await prisma.myListItem.findFirst({
      where: { userId, titleId },
    });

    if (existing) {
      return res.status(200).json(existing);
    }

    const item = await prisma.myListItem.create({
      data: { userId, titleId },
    });

    return res.status(201).json(item);
  } catch (error) {
    console.error("addToMyList error:", error);
    return res.status(500).json({ error: "Failed to add title to My List." });
  }
}

// DELETE /mylist/:titleId (Requires Auth)
export async function removeFromMyList(req, res) {
  try {
    const userId = req.user.id;
    const { titleId } = req.params;

    const existing = await prisma.myListItem.findFirst({
      where: { userId, titleId },
    });

    if (!existing) {
      return res.status(200).json({ message: "Title was not in My List." });
    }

    await prisma.myListItem.delete({
      where: { id: existing.id },
    });

    return res.status(200).json({ message: "Title removed from My List." });
  } catch (error) {
    console.error("removeFromMyList error:", error);
    return res.status(500).json({ error: "Failed to remove title from My List." });
  }
}

// GET /mylist (Requires Auth)
export async function getMyList(req, res) {
  try {
    const userId = req.user.id;

    const items = await prisma.myListItem.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
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
            releaseYear: true,
          },
        },
      },
    });

    return res.status(200).json(items);
  } catch (error) {
    console.error("getMyList error:", error);
    return res.status(500).json({ error: "Failed to fetch My List." });
  }
}
