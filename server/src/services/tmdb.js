/*
 * TMDB (themoviedb.org) metadata client.
 *
 * Config is read per call, not at module load. Reading it at the top level is
 * what made the whole server/.env surface silently invisible once before: ESM
 * evaluates imports before the importing module's body, so anything captured
 * here runs before a dotenv call further down. Reading late costs nothing and
 * cannot be broken by import order.
 *
 * Docs: https://developer.themoviedb.org/reference
 */

const DEFAULT_BASE_URL = "https://api.themoviedb.org/3";

// TMDB serves images from its own CDN, sized by a path segment.
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

function apiKey() {
  return process.env.TMDB_API_KEY;
}

function baseUrl() {
  return process.env.TMDB_BASE_URL || DEFAULT_BASE_URL;
}

export function isTmdbConfigured() {
  return Boolean(apiKey());
}

async function tmdbGet(path, params = {}) {
  const key = apiKey();
  if (!key) {
    throw new Error(
      "TMDB_API_KEY is not set. Add it to server/.env (see .env.example) before importing."
    );
  }

  const url = new URL(`${baseUrl()}${path}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  // Rate limits and short maintenance windows are routine on a long import, and
  // losing an hour's progress to one 503 is not acceptable. Retry those; fail
  // fast on anything that will not fix itself, like a bad key.
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  let lastError;

  // Five attempts backing off 1s, 2s, 4s, 8s — about 15s of patience. A four
  // attempt, 3.5s budget was not enough to ride out a real TMDB maintenance
  // blip observed mid-import.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }

    let res;
    try {
      res = await fetch(url);
    } catch (err) {
      lastError = err; // network blip
      continue;
    }

    if (res.ok) return res.json();

    // TMDB puts a human-readable reason in the body; surface it rather than a bare status.
    const detail = await res.json().catch(() => null);
    lastError = new Error(
      `TMDB ${path} failed: ${res.status}${detail?.status_message ? ` — ${detail.status_message}` : ""}`
    );
    if (!RETRYABLE.has(res.status)) throw lastError;
  }

  throw lastError;
}

/** Search movies by name. `year` narrows it when a title has been remade. */
export async function searchTitle(query, { year } = {}) {
  const data = await tmdbGet("/search/movie", { query, year, include_adult: false });
  return data.results ?? [];
}

/** Full record for one movie. */
export async function getTitleDetails(tmdbId) {
  return tmdbGet(`/movie/${tmdbId}`);
}

/**
 * The certification ("PG-13", "R"). It is not on the movie record — it lives in
 * per-country release data, so it needs its own call.
 */
export async function getCertification(tmdbId, region = "US") {
  const data = await tmdbGet(`/movie/${tmdbId}/release_dates`);
  const forRegion = (data.results ?? []).find((r) => r.iso_3166_1 === region);
  const certified = (forRegion?.release_dates ?? []).find((r) => r.certification);
  return certified?.certification || null;
}

/**
 * Absolute URL for a TMDB image path. Cards and the hero are landscape, so
 * callers want `backdrop_path` here — a poster is portrait and renders wrong
 * in both places.
 */
export function imageUrl(path, size = "w780") {
  if (!path) return null;
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

/** Browse by filters. Returns the raw discover page — 20 results at a time. */
export async function discoverMovies(params = {}) {
  return tmdbGet("/discover/movie", { include_adult: false, ...params });
}

/**
 * The same, for television. TMDB keeps films and series in separate discover
 * endpoints with different field names — `name` and `first_air_date` rather
 * than `title` and `release_date` — so callers must normalise.
 */
export async function discoverTv(params = {}) {
  return tmdbGet("/discover/tv", { include_adult: false, ...params });
}

/**
 * The genre id/name table. Discover returns ids only, so callers need this to
 * name them. Film and television have separate tables that overlap but do not
 * match — television has no "Science Fiction", it has "Sci-Fi & Fantasy" — so
 * a caller importing series must ask for the television one.
 */
export async function getGenres(media = "movie") {
  const data = await tmdbGet(`/genre/${media}/list`);
  return data.genres ?? [];
}

/**
 * Streaming providers available in a region, ordered as TMDB ranks them.
 * Normalised to { id, name } so callers can resolve human names to ids.
 */
export async function getProviders(region = "IN", media = "movie") {
  const data = await tmdbGet(`/watch/providers/${media}`, { watch_region: region });
  return (data.results ?? [])
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map((p) => ({ id: p.provider_id, name: p.provider_name }));
}
