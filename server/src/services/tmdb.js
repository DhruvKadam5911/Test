// TMDB (themoviedb.org) metadata client — placeholder until an API key is added.
// 1. Get a key: https://www.themoviedb.org/settings/api
// 2. Paste it into server/.env as TMDB_API_KEY
// 3. Implement the calls below (docs: https://developer.themoviedb.org/reference)

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = process.env.TMDB_BASE_URL || "https://api.themoviedb.org/3";

export function isTmdbConfigured() {
  return Boolean(TMDB_API_KEY);
}

// TODO: once TMDB_API_KEY is set, implement e.g.:
// export async function searchTitle(query) {
//   const res = await fetch(
//     `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`
//   );
//   if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);
//   return res.json();
// }
//
// export async function getTitleDetails(tmdbId, mediaType = "movie") {
//   const res = await fetch(`${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`);
//   if (!res.ok) throw new Error(`TMDB details failed: ${res.status}`);
//   return res.json();
// }

export async function searchTitle() {
  throw new Error("TMDB is not configured yet — set TMDB_API_KEY in server/.env and implement searchTitle().");
}

export async function getTitleDetails() {
  throw new Error("TMDB is not configured yet — set TMDB_API_KEY in server/.env and implement getTitleDetails().");
}
