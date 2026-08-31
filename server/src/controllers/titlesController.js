import prisma from "../config/db.js";
import { resolvePlaybackUrl } from "../services/videoProvider.js";
import { rankMatches } from "../services/titleSearch.js";

// The card-shaped projection. ContentCard consumes /titles, /titles/trending and
// /titles/search alike, so all three must select exactly this — diverging them
// breaks one of the three silently. See docs/schema.md.
const CARD_FIELDS = {
  id: true,
  title: true,
  voteAverage: true,
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

// TMDB gives some films no genre at all, and the importer labels those
// "Uncategorised". It is a bookkeeping value, not a shelf anyone would browse,
// so it is hidden from the home page's rows and from the hero. The titles
// themselves stay in the catalog and are still returned by search and by an
// explicit ?genre=Uncategorised request.
const PLACEHOLDER_GENRE = "Uncategorised";


/*
 * What the home page's rows are, in order terms. TMDB's own numbers stand in
 * for numbers this catalog does not have: nobody has watched anything here, so
 * "most viewed" is how many people rated it on TMDB.
 *
 * Each ordering excludes rows missing the field it sorts on — a null sorts
 * somewhere arbitrary and fills the row with titles that have no business
 * being top of anything.
 */
const SORTS = {
  trending: { orderBy: { popularity: "desc" }, where: { popularity: { not: null } } },
  viewed: { orderBy: { voteCount: "desc" }, where: { voteCount: { not: null } } },
  rated: {
    orderBy: { voteAverage: "desc" },
    // A single ten-out-of-ten vote is not a well-rated film.
    where: { voteAverage: { not: null }, voteCount: { gte: 200 } },
  },
  // Released, not announced: TMDB carries titles years ahead of their date, and
  // ordering by year alone filled the row with films nobody can watch yet.
  recent: {
    orderBy: [{ releaseYear: "desc" }, { popularity: "desc" }],
    where: { popularity: { not: null }, voteCount: { gte: 50 }, releaseYear: { lte: new Date().getFullYear() } },
  },
  newest: { orderBy: { createdAt: "desc" }, where: {} },
};

// GET /titles
export async function getTitles(req, res) {
  try {
    const { genre, contentType, isOriginal, sort, limit = 20, offset = 0 } = req.query;

    const chosen = SORTS[sort] || SORTS.newest;
    const where = { ...chosen.where };
    if (genre) where.genre = { equals: genre, mode: "insensitive" };
    if (contentType) where.contentType = contentType;
    if (isOriginal !== undefined) where.isOriginal = isOriginal === "true";

    const titles = await prisma.title.findMany({
      where,
      take: Math.min(Number(limit) || 20, MAX_LIMIT),
      skip: Number(offset),
      orderBy: chosen.orderBy,
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
      where: { genre: { not: PLACEHOLDER_GENRE }, popularity: { not: null } },
      take: 10,
      orderBy: { popularity: "desc" },
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

    // Ranked in the service, which tolerates a misspelling — see
    // services/titleSearch.js for why this is not a SQL LIKE.
    const ids = await rankMatches(query, Math.min(Number(limit) || 40, MAX_LIMIT));
    if (ids.length === 0) return res.status(200).json([]);

    const rows = await prisma.title.findMany({
      where: { id: { in: ids } },
      select: CARD_FIELDS,
    });

    // findMany returns rows in the database's order, not the ranking's, so the
    // best match would otherwise land wherever Postgres felt like putting it.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

    return res.status(200).json(ordered);
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
      where: { genre: { not: PLACEHOLDER_GENRE } },
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
