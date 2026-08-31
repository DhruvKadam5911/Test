import { neon } from "@neondatabase/serverless";

/*
 * Remove duplicate catalog rows, writing to the database directly.
 *
 *   BACKFILL_URL="postgres://…" node prisma/dedupe-direct.mjs          # dry run
 *   BACKFILL_URL="postgres://…" node prisma/dedupe-direct.mjs --apply  # deletes
 *
 * Same rules as services/catalogCleanup.js, which is what /admin/dedupe runs;
 * this exists for the same reason backfill-direct.mjs does — CRON_SECRET is
 * stored as a sensitive Vercel variable and cannot be read back, while Neon's
 * HTTP endpoint takes a database URL.
 *
 * Deliberately conservative. A row is only deleted when it is a duplicate AND
 * carries nothing that would be lost with it: no stream, no seasons, and
 * nothing on anyone's list or watch history. Everything else is reported and
 * kept.
 */

const neonSql = neon(process.env.BACKFILL_URL || process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");

/** One statement, retried — the HTTP endpoint drops the occasional connection. */
const sql = {
  async query(text, params = []) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await neonSql.query(text, params);
      } catch (err) {
        if (attempt === 4) throw err;
        await new Promise((r) => setTimeout(r, attempt * 3000));
      }
    }
  },
};

// The row worth keeping: a playable one first, then an original, then the one
// that has been in the catalog longest — its id is what any existing link
// points at.
const KEEPERS = `
  select distinct on (lower(trim(title)), "releaseYear") id
  from "Title"
  order by lower(trim(title)), "releaseYear",
           ("playbackUrl" is null), ("isOriginal" = false), "createdAt"
`;

// A duplicate that is safe to lose: not the keeper, and nothing hangs off it.
const REMOVABLE = `
  select t.id, t.title, t."releaseYear"
  from "Title" t
  where t.id not in (${KEEPERS})
    and t."playbackUrl" is null
    and not exists (select 1 from "Season" s where s."titleId" = t.id)
    and not exists (select 1 from "WatchProgress" w where w."titleId" = t.id)
    and not exists (select 1 from "MyListItem" m where m."titleId" = t.id)
`;

async function main() {
  if (!process.env.BACKFILL_URL && !process.env.DATABASE_URL) {
    throw new Error("Set BACKFILL_URL to the database to clean.");
  }

  const [{ n: before }] = await sql.query('select count(*)::int as n from "Title"');
  const removable = await sql.query(REMOVABLE);

  // Duplicates that are staying, so nothing disappears silently.
  const kept = await sql.query(`
    select t.title, t."releaseYear"
    from "Title" t
    where t.id not in (${KEEPERS})
      and t.id not in (select id from (${REMOVABLE}) r)
  `);

  console.log(`Catalog: ${before.toLocaleString()} titles`);
  console.log(`Duplicates that can go: ${removable.length.toLocaleString()}`);
  for (const r of removable.slice(0, 10)) console.log(`   - ${r.title} (${r.releaseYear})`);
  if (removable.length > 10) console.log(`   … and ${removable.length - 10} more`);

  if (kept.length) {
    console.log(`\nDuplicates kept because something hangs off them: ${kept.length}`);
    for (const r of kept.slice(0, 10)) console.log(`   - ${r.title} (${r.releaseYear})`);
  }

  if (!APPLY) {
    console.log("\nDry run — nothing deleted. Re-run with --apply.");
    return;
  }

  if (!removable.length) {
    console.log("\nNothing to delete.");
    return;
  }

  // Deleted by id in batches rather than as one statement, so a timeout costs
  // one batch instead of the whole run.
  let deleted = 0;
  for (let i = 0; i < removable.length; i += 500) {
    const ids = removable.slice(i, i + 500).map((r) => r.id);
    await sql.query(`delete from "Title" where id = any($1::text[])`, [ids]);
    deleted += ids.length;
    process.stdout.write(`\r   deleted ${deleted}/${removable.length}…`);
  }

  const [{ n: after }] = await sql.query('select count(*)::int as n from "Title"');
  console.log(`\n\n✅ Deleted ${deleted.toLocaleString()}. Catalog is now ${after.toLocaleString()}.`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exitCode = 1;
});
