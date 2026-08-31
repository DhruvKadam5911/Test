/*
 * YouTube, as the music source.
 *
 * YouTube Music's catalogue is YouTube's catalogue — the Indian labels put
 * everything on it — and the embedded player is the licensed way to play it:
 * YouTube serves the ads, the rights holders get paid. Nothing here fetches
 * audio; the browser plays the video through YouTube's own player.
 *
 * Quota is the constraint that shapes this file. The free allowance is 10,000
 * units a day and a search costs 100 of them — a hundred searches. So:
 *
 *   - `videos.list` for the charts costs 1 unit, and is what the page opens on.
 *   - Every search result is written to the Track table, and the API is only
 *     asked for a query the catalog cannot already answer.
 */

const BASE_URL = "https://www.googleapis.com/youtube/v3";
const TIMEOUT_MS = 12_000;

// Category 10 is Music. Without it a search for a song returns reaction videos.
const MUSIC_CATEGORY = "10";

// Read per call rather than at module load, so a key added after a deploy takes
// effect without one.
const apiKey = () => process.env.YOUTUBE_API_KEY || "";

export function isYoutubeConfigured() {
  return Boolean(apiKey());
}

async function get(path, params) {
  const key = apiKey();
  if (!key) throw new Error("YOUTUBE_API_KEY is not configured on this deployment.");

  const url = new URL(`${BASE_URL}/${path}`);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = await res.json();
    if (!res.ok) {
      // Quota exhaustion is the failure worth naming: it is not a bug, and it
      // clears at midnight Pacific.
      const reason = body?.error?.errors?.[0]?.reason;
      if (reason === "quotaExceeded") throw new Error("YouTube's daily quota is used up. It resets at 00:00 Pacific.");
      throw new Error(body?.error?.message || `YouTube ${path} failed: ${res.status}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** "PT3M52S" — YouTube's duration format — as seconds. */
function parseDuration(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function thumbnail(thumbnails = {}) {
  return (thumbnails.maxres || thumbnails.high || thumbnails.medium || thumbnails.default)?.url || null;
}

function toTrack(video) {
  return {
    source: "youtube",
    sourceId: video.id?.videoId || video.id,
    title: video.snippet?.title || "Untitled",
    // The uploading channel, which for music is usually the label or artist.
    artist: video.snippet?.channelTitle || "Unknown",
    artworkUrl: thumbnail(video.snippet?.thumbnails),
    durationSeconds: parseDuration(video.contentDetails?.duration),
    genre: null,
    // Playback goes through YouTube's player using sourceId; there is no file
    // to point at, and there should not be one.
    audioUrl: null,
  };
}

/**
 * What is charting in a region right now. One unit, so this is what the page
 * can afford to load on every visit.
 */
export async function fetchChart({ region = "IN", limit = 50 } = {}) {
  const data = await get("videos", {
    part: "snippet,contentDetails",
    chart: "mostPopular",
    videoCategoryId: MUSIC_CATEGORY,
    regionCode: region,
    maxResults: Math.min(limit, 50),
  });
  return (data.items ?? []).map(toTrack);
}

/**
 * Search. A hundred units a call, so callers should exhaust the catalog first.
 *
 * Durations need a second request — search results do not carry them — but that
 * one costs a single unit for the whole page.
 */
export async function searchMusic({ query, region = "IN", limit = 25 } = {}) {
  const found = await get("search", {
    part: "snippet",
    q: query,
    type: "video",
    videoCategoryId: MUSIC_CATEGORY,
    regionCode: region,
    maxResults: Math.min(limit, 50),
  });

  const ids = (found.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return [];

  const detailed = await get("videos", {
    part: "snippet,contentDetails",
    id: ids.join(","),
  });

  return (detailed.items ?? []).map(toTrack);
}
