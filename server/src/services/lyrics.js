/*
 * Lyrics.
 *
 * There is no free, legal source for full lyrics. Genius's API returns
 * metadata and a link but never the words; every service that does return them
 * licenses them from the publishers, because that is what the words are —
 * licensed work, separate from the recording.
 *
 * Musixmatch is the one with a free tier: it returns the first 30% of a song
 * with mandatory attribution and a link, which is what this uses. Without a key
 * the endpoint says so rather than showing an empty panel that looks broken.
 *
 * Never scrape a lyrics site to fill this in. It is the same mistake as ripping
 * the audio, one layer up.
 */

const BASE_URL = "https://api.musixmatch.com/ws/1.1";
const TIMEOUT_MS = 10_000;

const apiKey = () => process.env.MUSIXMATCH_API_KEY || "";

export function isLyricsConfigured() {
  return Boolean(apiKey());
}

async function get(path, params) {
  const url = new URL(`${BASE_URL}/${path}`);
  url.searchParams.set("apikey", apiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = await res.json();
    const status = body?.message?.header?.status_code;
    if (status !== 200) throw new Error(`Musixmatch ${path} returned ${status}`);
    return body.message.body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The lyric for a track, as far as the free tier goes.
 *
 * `track` and `artist` come from a YouTube title, which carries film names and
 * cast alongside the song, so the caller should pass the cleaned-up core.
 */
export async function fetchLyrics({ track, artist }) {
  const found = await get("matcher.lyrics.get", { q_track: track, q_artist: artist });
  const lyrics = found?.lyrics;
  if (!lyrics?.lyrics_body) return null;

  return {
    // The free tier is a partial lyric by design, and saying so is part of the
    // licence rather than a nicety.
    text: lyrics.lyrics_body.replace(/\*+ This Lyrics is NOT for Commercial use \*+/g, "").trim(),
    partial: true,
    attribution: lyrics.lyrics_copyright?.trim() || "Lyrics provided by Musixmatch",
    trackingUrl: lyrics.pixel_tracking_url || null,
  };
}
