import prisma from "../config/db.js";

/*
 * Removing duplicate catalog rows.
 *
 * The bulk imports ran as separate slices — by platform, then by language, then
 * by year — and each de-duplicated only against the catalog as it stood when it
 * ran. A film in two slices, Sholay for one, was inserted twice and shows twice
 * in search.
 *
 * Done in SQL rather than by reading the catalog into the function. At seven
 * thousand titles either worked; at eighty thousand, pulling every row with its
 * relation counts does not finish inside a serverless invocation's time limit.
 * Nor does `id NOT IN (SELECT DISTINCT ON …)` — that timed out too. One pass
 * with a window function does.
 *
 * Deliberately conservative. A row is only deleted when it is a duplicate AND
 * carries nothing that would be lost with it — no stream, no seasons, nothing
 * on anyone's list or watch history. Everything else is reported and kept.
 */

/*
 * Rank the rows of each duplicate group. Rank 1 is the one worth keeping: a
 * playable row first, then an original, then whichever has been in the catalog
 * longest — its id is what any existing link points at.
 */
const RANKED = `
  SELECT id, title, "releaseYear", "playbackUrl",
         row_number() OVER (
           PARTITION BY lower(trim(title)), "releaseYear"
           ORDER BY ("playbackUrl" IS NULL), ("isOriginal" = false), "createdAt"
         ) AS rn
  FROM "Title"
`;

/** Duplicates that are safe to lose: not rank 1, and nothing hangs off them. */
const REMOVABLE = `
  SELECT r.id, r.title, r."releaseYear"
  FROM (${RANKED}) r
  WHERE r.rn > 1
    AND r."playbackUrl" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "Season" s WHERE s."titleId" = r.id)
    AND NOT EXISTS (SELECT 1 FROM "WatchProgress" w WHERE w."titleId" = r.id)
    AND NOT EXISTS (SELECT 1 FROM "MyListItem" m WHERE m."titleId" = r.id)
`;

// Deleted in batches so a slow statement costs one batch, not the whole run,
// and so a single call stays inside the function's time limit.
const DELETE_BATCH = 5000;
// Leaves room for the response; the caller re-runs until `removable` is 0.
const MAX_BATCHES_PER_CALL = 6;

/**
 * @param {{ apply?: boolean }} options — dry run unless `apply` is true, so the
 *   endpoint can be called to see what it would do before it does it.
 */
export async function dedupeTitles({ apply = false } = {}) {
  const [{ count: removable }] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM (${REMOVABLE}) d`
  );

  const examples = await prisma.$queryRawUnsafe(`${REMOVABLE} LIMIT 10`);

  let deleted = 0;
  if (apply && removable > 0) {
    for (let batch = 0; batch < MAX_BATCHES_PER_CALL; batch++) {
      const count = await prisma.$executeRawUnsafe(
        `DELETE FROM "Title" WHERE id IN (SELECT id FROM (${REMOVABLE}) d LIMIT ${DELETE_BATCH})`
      );
      deleted += count;
      if (count === 0) break;
    }
  }

  return {
    removable,
    deleted,
    remaining: Math.max(0, removable - deleted),
    examples: examples.map((r) => `${r.title} (${r.releaseYear})`),
    applied: apply,
  };
}
