/*
 * Fill the catalog from TMDB, by driving the deployed API.
 *
 *   node prisma/backfill-catalog.mjs --secret <CRON_SECRET>
 *
 * Why it works this way: the import itself runs on the server, which is the
 * only place that can reach both TMDB and the database. This script is just the
 * caller — it decides which slices to ask for and keeps asking until each one
 * is exhausted. That also means it can be stopped and re-run at any time; every
 * import is idempotent, so a second run adds only what the first one missed.
 *
 * The shape of the problem: TMDB serves at most 500 pages of 20 for any one
 * query, a hard 10,000-row ceiling. "Everything" is therefore not one request —
 * it is many narrow ones. Slices are cut by medium (film, series) and original
 * language, and any slice that would hit the ceiling is cut again by year.
 */

const API = process.env.ONION_API || "https://onion-tv-api.vercel.app";
const SECRET = process.argv.includes("--secret")
  ? process.argv[process.argv.indexOf("--secret") + 1]
  : process.env.CRON_SECRET;

// Pages the server will import per call. Its own cap is 10, and a serverless
// invocation is killed at 60s, so this is the most one call can safely do.
const PAGES_PER_CALL = 10;
const PAGE_SIZE = 20;
const MAX_REACHABLE = 500 * PAGE_SIZE;

// Indian cinema first — it is what the catalog was short of — then English,
// then the languages whose shows people search for by their English names:
// Spanish (Money Heist is La casa de papel to TMDB), Korean, Japanese.
const LANGUAGES = [
  ["hi", "Hindi"], ["pa", "Punjabi"], ["ta", "Tamil"], ["te", "Telugu"],
  ["ml", "Malayalam"], ["kn", "Kannada"], ["bn", "Bengali"], ["mr", "Marathi"],
  ["gu", "Gujarati"], ["ur", "Urdu"], ["en", "English"],
  ["es", "Spanish"], ["ko", "Korean"], ["ja", "Japanese"],
];

const YEAR_TO = new Date().getFullYear();
const YEAR_FROM = 1970;

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const MAX_CALLS = Number(argOf("--max-calls", Infinity));
// Pages to take from any one query. English alone is 558,000 films; drained in
// full that is several hundred thousand rows — more than the database is sized
// for, and hours of calls for titles nobody will scroll to. The cap keeps the
// most popular of every year and language.
const MAX_PAGES = Number(argOf("--max-pages", 500));
const ONLY_MEDIA = argOf("--media", null);
const ONLY_LANGUAGES = argOf("--languages", null)?.split(",");

let calls = 0;
let added = 0;
let failed = 0;

async function refresh(params) {
  const query = new URLSearchParams({ secret: SECRET, provider: "any", ...params });
  calls++;

  // A slice can fail on a cold function or a TMDB burst; one retry is enough,
  // and anything it still misses the next run picks up.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${API}/admin/refresh?${query}`);
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

/** Walk one slice from page 1 until TMDB has nothing left to give. */
async function drain(label, params) {
  let fromPage = 1;
  let sliceAdded = 0;

  while (fromPage <= MAX_PAGES && calls < MAX_CALLS) {
    const result = await refresh({ ...params, fromPage: String(fromPage), pages: String(PAGES_PER_CALL) });
    if (!result) break;

    sliceAdded += result.added;
    added += result.added;
    process.stdout.write(
      `\r   ${label} — page ${fromPage}-${result.lastPage}, +${sliceAdded} (catalog +${added})   `
    );

    if (result.pagesRemaining === 0 || result.scanned === 0) break;
    fromPage = result.lastPage + 1;
    if (fromPage > MAX_PAGES) break;
  }

  process.stdout.write("\n");
  return sliceAdded;
}

async function main() {
  if (!SECRET) {
    console.error("Pass --secret <CRON_SECRET>, or set it in the environment. Without it the API refuses every call.");
    process.exit(1);
  }

  console.log(`📥 Backfilling ${API} from TMDB\n`);

  for (const media of ["movie", "tv"]) {
    if (ONLY_MEDIA && ONLY_MEDIA !== media) continue;

    for (const [code, name] of LANGUAGES) {
      if (ONLY_LANGUAGES && !ONLY_LANGUAGES.includes(code)) continue;
      if (calls >= MAX_CALLS) break;

      const base = { media, language: code };
      // One cheap call to find out how big the slice is before deciding how to
      // cut it. Its results are imported too, so nothing is wasted.
      const probe = await refresh({ ...base, fromPage: "1", pages: "1" });
      if (!probe) continue;

      added += probe.added;
      const total = probe.totalAvailable;
      const label = `${name} ${media === "tv" ? "series" : "films"}`;

      if (total === 0) {
        console.log(`   ${label} — nothing on TMDB`);
        continue;
      }

      if (total <= MAX_REACHABLE) {
        console.log(`▶ ${label}: ${total.toLocaleString()} on TMDB`);
        await drain(label, base);
        continue;
      }

      // Past the ceiling, so ask year by year. Each year is its own query with
      // its own 10,000-row window.
      console.log(`▶ ${label}: ${total.toLocaleString()} on TMDB — over the 10,000 ceiling, going year by year`);
      for (let year = YEAR_TO; year >= YEAR_FROM && calls < MAX_CALLS; year--) {
        await drain(`${label} ${year}`, { ...base, year: String(year) });
      }
    }
  }

  console.log(`\n✅ ${added.toLocaleString()} titles added in ${calls} calls${failed ? `, ${failed} call(s) failed` : ""}.`);
  if (calls >= MAX_CALLS) console.log("   Stopped at --max-calls; re-run to continue where this left off.");
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exitCode = 1;
});
