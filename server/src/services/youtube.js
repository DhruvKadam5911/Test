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

/*
 * Putting the original above everything that sounds like it.
 *
 * A YouTube search for a song returns the record label's upload, a lyric video,
 * three reuploads, a slowed-and-reverbed edit and a dance cover, in whatever
 * order YouTube likes. Someone searching "kesariya" wants the first of those.
 *
 * There is no "official" flag in the API, so this reads the two things that do
 * carry the signal: who uploaded it, and what they called it.
 */

// Channels that hold the rights to what they upload. VEVO is matched by suffix.
const LABELS = [
  "t-series", "sony music india", "sony music south", "zee music company",
  "saregama", "tips official", "tips films", "yrf", "speed records",
  "times music", "aditya music", "lahari music", "divo", "think music india",
  "muzik247", "wave music", "venus", "shemaroo", "eros now music",
  "sony music entertainment", "universal music", "believe music",
];

// What a reupload, an edit or a cover tends to be called.
const NOT_THE_ORIGINAL = [
  "lyric", "lyrics", "cover", "karaoke", "instrumental", "slowed", "reverb",
  "8d", "mashup", "remix", "dj ", "reaction", "review", "status", "ringtone",
  "tutorial", "choreograph", "dance cover", "flute", "piano", "guitar",
  "nightcore", "sped up", "loop", "1 hour", "bass boosted",
];

const OFFICIAL_WORDS = ["official", "full video", "full song", "video song", "audio song"];

function originalityScore(track, index) {
  const channel = (track.artist || "").toLowerCase();
  const title = (track.title || "").toLowerCase();

  let score = 0;
  if (channel.endsWith("vevo")) score += 60;
  if (LABELS.some((l) => channel.includes(l))) score += 50;
  if (OFFICIAL_WORDS.some((w) => title.includes(w))) score += 25;

  // One penalty, not one per word: a title can say "lyrics" twice.
  if (NOT_THE_ORIGINAL.some((w) => title.includes(w))) score -= 45;

  // A minute is too short for a song and usually means a clip; twenty is long
  // enough to be a jukebox rather than the track someone asked for.
  const seconds = track.durationSeconds ?? 0;
  if (seconds && seconds < 60) score -= 30;
  if (seconds > 1200) score -= 20;

  // YouTube's own relevance, kept as the tiebreak rather than thrown away.
  return score - index * 0.5;
}

/** Best first: the label's own upload before the lyric video that copies it. */
export function rankByOriginality(tracks) {
  return tracks
    .map((track, index) => ({ track, score: originalityScore(track, index) }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.track);
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

  return rankByOriginality((detailed.items ?? []).map(toTrack));
}

/**
 * The part of a title that names the song, before the credits start.
 *
 * "Kesariya - Brahmāstra | Ranbir Kapoor…" and "Kesariya (Lyrics) Full Song"
 * are the same song; "Kesariya" is what they have in common. Everything after
 * the first dash, pipe or bracket is cast, film and label.
 */
export function titleCore(title) {
  return String(title || "")
    .split(/[|\-–—([]/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/(full|video|song|music|mix|version|official|audio|lyrical|new|hd|4k|8k|remastered)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Songs like this one, rather than other copies of it.
 *
 * YouTube withdrew `relatedToVideoId` from the API in 2023, so "related" has to
 * be built from what is left. The channel is the strongest signal available:
 * a label or an artist channel holds work by the same people in the same idiom.
 *
 * Then every version of the seed itself is dropped — the lyric video, the
 * slowed edit, the audio-only reupload — because someone who just picked a song
 * does not want it back five more times.
 */
export async function searchRelated({ title, artist, exclude, region = "IN", limit = 25 } = {}) {
  const seed = titleCore(title);
  // The song, not the channel. Searching the artist alone gave every track on
  // a label the same list of recommendations — pick any Sony song and get the
  // same twenty back — so the mood of the one playing was lost immediately.
  // Its own title is what YouTube's relatedness has to work with.
  const query = [seed, artist].filter(Boolean).join(" ").trim();
  if (!query) return [];

  const tracks = await searchMusic({ query, region, limit: 50 });

  return tracks
    .filter((t) => t.sourceId !== exclude)
    .filter((t) => !seed || titleCore(t.title) !== seed)
    .slice(0, limit);
}

/**
 * Albums and playlists. A separate call, and therefore another hundred units,
 * because playlists do not come back from a video search however wide it is
 * asked to be — tested, not assumed.
 */
export async function searchAlbums({ query, region = "IN", limit = 25 } = {}) {
  const found = await get("search", {
    part: "snippet",
    q: query,
    type: "playlist",
    regionCode: region,
    maxResults: Math.min(limit, 50),
  });

  return (found.items ?? [])
    .map((item) => ({
      source: "youtube-playlist",
      sourceId: item.id?.playlistId,
      title: item.snippet?.title || "Untitled",
      artist: item.snippet?.channelTitle || "Unknown",
      artworkUrl: thumbnail(item.snippet?.thumbnails),
      durationSeconds: null,
      genre: null,
      audioUrl: null,
    }))
    .filter((p) => p.sourceId);
}
