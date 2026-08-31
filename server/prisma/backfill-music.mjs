/*
 * Fill the music catalog, by driving the deployed API.
 *
 *   node prisma/backfill-music.mjs --secret <CRON_SECRET>
 *
 * Same arrangement as backfill-catalog.mjs: the import runs on the server, this
 * only decides which slices to ask for and keeps asking. Every slice is
 * idempotent — a track carries the id its source gave it, and a unique index
 * rejects the second copy — so it can be stopped and re-run at any point.
 */

const API = process.env.ONION_API || "https://onion-tv-api.vercel.app";
const SECRET = process.argv.includes("--secret")
  ? process.argv[process.argv.indexOf("--secret") + 1]
  : process.env.CRON_SECRET;

const AUDIUS_GENRES = [
  "Electronic", "Hip-Hop/Rap", "Alternative", "Pop", "Rock", "Ambient",
  "Downtempo", "House", "Techno", "Drum & Bass", "Dubstep", "Trap",
  "Lo-Fi", "Soul", "R&B", "Jazz", "Classical", "Folk", "Latin", "World",
  "Reggae", "Metal", "Punk", "Country", "Devotional", "Experimental",
];

const ARCHIVE_COLLECTIONS = [
  "audio_music", "etree", "78rpm", "audio_bookspoetry", "opensource_audio",
];

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

// Pages per call. The server caps it at 10; the Archive is two requests per
// item, so it gets fewer or the invocation runs out of time.
const AUDIUS_PAGES = Number(argOf("--audius-pages", 3));
const ARCHIVE_PAGES = Number(argOf("--archive-pages", 2));
// How far to walk each slice before moving on.
const ROUNDS = Number(argOf("--rounds", 4));
const ONLY_SOURCE = argOf("--source", null);

let calls = 0;
let added = 0;
let failed = 0;

async function refresh(params) {
  const query = new URLSearchParams({ secret: SECRET, ...params });
  calls++;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${API}/admin/refresh-music?${query}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    } catch (err) {
      if (attempt === 2) {
        failed++;
        console.warn(`   ⚠️  ${err.message}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

async function drain(label, params, pages) {
  let sliceAdded = 0;

  for (let round = 0; round < ROUNDS; round++) {
    const fromPage = round * pages + 1;
    const result = await refresh({ ...params, fromPage: String(fromPage), pages: String(pages) });
    if (!result) break;

    sliceAdded += result.added;
    added += result.added;
    process.stdout.write(`\r   ${label} — +${sliceAdded} (catalog ${result.total})      `);

    // Nothing new and nothing seen means the source has run out.
    if (result.scanned === 0) break;
  }

  process.stdout.write("\n");
  return sliceAdded;
}

async function main() {
  if (!SECRET) {
    console.error("Pass --secret <CRON_SECRET>. Without it the API refuses every call.");
    process.exit(1);
  }

  console.log(`🎵 Backfilling music into ${API}\n`);

  if (ONLY_SOURCE !== "archive") {
    console.log("▶ Audius — whole tracks, browsed by genre");
    for (const genre of AUDIUS_GENRES) {
      await drain(genre, { source: "audius", genre }, AUDIUS_PAGES);
    }
  }

  if (ONLY_SOURCE !== "audius") {
    console.log("\n▶ Internet Archive — public domain, Creative Commons and taped-with-permission live");
    for (const collection of ARCHIVE_COLLECTIONS) {
      await drain(collection, { source: "archive", genre: collection }, ARCHIVE_PAGES);
    }
  }

  console.log(`\n✅ ${added.toLocaleString()} tracks added in ${calls} calls${failed ? `, ${failed} call(s) failed` : ""}.`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exitCode = 1;
});
