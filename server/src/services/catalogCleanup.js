import prisma from "../config/db.js";

/*
 * Removing duplicate catalog rows.
 *
 * The bulk SQL imports were generated as separate files (bollywood, pollywood,
 * hollywood). Each file de-duplicated against the catalog as it stood when the
 * file was written, so a film appearing in two slices — Sholay, for instance —
 * was inserted twice and now shows twice in search.
 *
 * Runs server-side for the same reason the catalog refresh does: the API can
 * reach the database, a developer machine behind a restrictive network may not.
 *
 * Deliberately conservative. A row is only deleted when it is a duplicate AND
 * carries nothing that would be lost with it — no stream, no seasons, nothing
 * on anyone's list or watch history. Everything else is reported and kept.
 */

/** Same film, as far as a viewer is concerned. */
function key(t) {
  return `${t.title.trim().toLowerCase()}|${t.releaseYear}`;
}

/**
 * The row worth keeping: a playable one first, then an original, then the one
 * that has been in the catalog longest (its id is the one any existing link
 * points at).
 */
function rank(t) {
  return [t.playbackUrl ? 0 : 1, t.isOriginal ? 0 : 1, t.createdAt.getTime()];
}

function better(a, b) {
  const [ra, rb] = [rank(a), rank(b)];
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] < rb[i] ? a : b;
  }
  return a;
}

/**
 * @param {{ apply?: boolean }} options — dry run unless `apply` is true, so the
 *   endpoint can be called to see what it would do before it does it.
 */
export async function dedupeTitles({ apply = false } = {}) {
  const titles = await prisma.title.findMany({
    select: {
      id: true,
      title: true,
      releaseYear: true,
      playbackUrl: true,
      isOriginal: true,
      createdAt: true,
      _count: { select: { seasons: true, watchProgresses: true, myListItems: true } },
    },
  });

  const groups = new Map();
  for (const t of titles) {
    const k = key(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }

  const removable = [];
  const kept = [];

  for (const [, rows] of groups) {
    if (rows.length < 2) continue;

    const keeper = rows.reduce(better);
    for (const row of rows) {
      if (row.id === keeper.id) continue;

      const attached =
        row.playbackUrl ||
        row._count.seasons > 0 ||
        row._count.watchProgresses > 0 ||
        row._count.myListItems > 0;

      if (attached) kept.push({ id: row.id, title: row.title, reason: "has content or viewer data" });
      else removable.push(row.id);
    }
  }

  let deleted = 0;
  if (apply && removable.length) {
    const result = await prisma.title.deleteMany({ where: { id: { in: removable } } });
    deleted = result.count;
  }

  return {
    scanned: titles.length,
    duplicateGroups: [...groups.values()].filter((g) => g.length > 1).length,
    removable: removable.length,
    deleted,
    keptDespiteDuplicate: kept,
    applied: apply,
  };
}
