import { importSlice, MAX_PAGE } from "../services/catalogImport.js";
import { dedupeTitles } from "../services/catalogCleanup.js";
import { isTmdbConfigured } from "../services/tmdb.js";

/*
 * Catalog refresh, run on the server rather than by pasting SQL.
 *
 * Guarded by CRON_SECRET. Without it set, the route refuses everything — an
 * open endpoint that writes to the catalog is not something to leave running
 * by accident.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; a `secret` query
 * parameter is accepted too so it can be triggered by hand.
 */

// What the scheduled run pulls. Sorted by popularity, so a small daily slice
// naturally picks up new releases without needing a stored cursor.
const SCHEDULED_SLICE = {
  providers: ["Netflix", "Amazon Prime Video", "JioHotstar", "Zee5"],
  region: "IN",
  pages: 3,
};

function authorised(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return req.query.secret === secret;
}

export async function refreshCatalog(req, res) {
  if (!authorised(req)) {
    // Deliberately vague: do not confirm whether the secret is merely wrong or
    // has never been configured.
    return res.status(401).json({ error: "Unauthorized." });
  }

  if (!isTmdbConfigured()) {
    return res.status(503).json({ error: "TMDB_API_KEY is not configured on this deployment." });
  }

  const { language, country, genre, provider, fromPage, pages, region, media, year } = req.query;
  const list = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : undefined);

  // `provider=any` means no platform filter. The nightly cron watches four
  // services, but most of TMDB is not on them, so the backfill needs a way to
  // ask for everything — and an omitted parameter cannot express that, since it
  // already means "use the scheduled default".
  const providers = provider === "any" ? [] : list(provider) ?? SCHEDULED_SLICE.providers;

  try {
    const result = await importSlice({
      media: media === "tv" ? "tv" : "movie",
      providers,
      genres: list(genre) ?? [],
      language: language || null,
      country: country || null,
      year: Number(year) || null,
      region: region || SCHEDULED_SLICE.region,
      fromPage: Math.max(1, Math.min(Number(fromPage) || 1, MAX_PAGE)),
      // Capped because a serverless invocation is killed at its time limit and
      // a half-finished import reports nothing.
      pages: Math.max(1, Math.min(Number(pages) || SCHEDULED_SLICE.pages, 10)),
    });

    return res.status(200).json({ status: "ok", ...result });
  } catch (error) {
    console.error("refreshCatalog error:", error);
    return res.status(500).json({ error: error.message || "Catalog refresh failed." });
  }
}

/*
 * GET /admin/dedupe
 *
 * Reports the duplicate rows the bulk imports left behind. Dry run by default —
 * it only deletes when called with ?apply=true, because deleting catalog rows
 * is not something a mistyped URL should be able to do.
 */
export async function dedupe(req, res) {
  if (!authorised(req)) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  try {
    const result = await dedupeTitles({ apply: req.query.apply === "true" });
    return res.status(200).json({ status: "ok", ...result });
  } catch (error) {
    console.error("dedupe error:", error);
    return res.status(500).json({ error: error.message || "Dedupe failed." });
  }
}
