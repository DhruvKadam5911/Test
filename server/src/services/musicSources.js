/*
 * Where the music comes from.
 *
 * Two sources, both free, both needing no key, and both serving whole tracks
 * rather than the thirty-second previews the commercial APIs offer:
 *
 *   Audius   — artists upload for streaming, so linking the stream is the
 *              intended use. Browsed by genre.
 *   Archive  — the Internet Archive's audio collections: public domain,
 *              Creative Commons, and live recordings taped with permission.
 *
 * Deliberately not here: anything that rips audio out of Spotify, YouTube or
 * JioSaavn. Those work, and hosting the result on a public site is
 * redistribution of music nobody licensed.
 */

const AUDIUS_HOST = "https://discoveryprovider.audius.co";
const ARCHIVE_HOST = "https://archive.org";
const APP_NAME = "oniontv";

// Both APIs are ordinary HTTP and occasionally slow; a request that hangs
// should not hold a serverless invocation open until it is killed.
const TIMEOUT_MS = 12_000;

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** The genres Audius itself files tracks under. */
export const AUDIUS_GENRES = [
  "Electronic", "Hip-Hop/Rap", "Alternative", "Pop", "Rock", "Ambient",
  "Downtempo", "House", "Techno", "Drum & Bass", "Dubstep", "Trap",
  "Lo-Fi", "Soul", "R&B", "Jazz", "Classical", "Folk", "Latin", "World",
  "Reggae", "Metal", "Punk", "Country", "Devotional", "Experimental",
];

/**
 * One page of Audius tracks in a genre.
 *
 * The stream URL redirects to whichever node holds the audio; an <audio>
 * element follows that on its own, so the redirecting URL is what gets stored.
 */
export async function fetchAudiusTracks({ genre, limit = 100, offset = 0 }) {
  const params = new URLSearchParams({
    app_name: APP_NAME,
    limit: String(limit),
    offset: String(offset),
  });
  if (genre) params.set("genre", genre);

  const data = await getJson(`${AUDIUS_HOST}/v1/tracks/trending?${params}`);

  return (data.data ?? []).map((t) => ({
    source: "audius",
    sourceId: String(t.id),
    title: t.title,
    artist: t.user?.name || t.user?.handle || "Unknown",
    genre: t.genre || genre || null,
    durationSeconds: t.duration ?? null,
    audioUrl: `${AUDIUS_HOST}/v1/tracks/${t.id}/stream?app_name=${APP_NAME}`,
    artworkUrl: t.artwork?.["480x480"] || t.artwork?.["150x150"] || null,
  }));
}

/** Collections worth walking, and what to call what comes out of each. */
export const ARCHIVE_COLLECTIONS = [
  { collection: "audio_music", genre: "Archive" },
  { collection: "etree", genre: "Live" },
  { collection: "78rpm", genre: "Vintage" },
  { collection: "audio_bookspoetry", genre: "Spoken" },
  { collection: "opensource_audio", genre: "Independent" },
];

/**
 * One page of Internet Archive items. Search returns items, not tracks: the
 * file inside has to be asked for separately, which is why this is two calls
 * per item rather than one per page.
 */
export async function fetchArchiveItems({ collection, page = 1, rows = 50 }) {
  const params = new URLSearchParams({
    q: `collection:(${collection}) AND format:(MP3)`,
    rows: String(rows),
    page: String(page),
    output: "json",
  });
  params.append("fl[]", "identifier");
  params.append("fl[]", "title");
  params.append("fl[]", "creator");

  const data = await getJson(`${ARCHIVE_HOST}/advancedsearch.php?${params}`);
  return data.response?.docs ?? [];
}

/**
 * The first playable MP3 in an item, as a track. Returns null when the item has
 * none — plenty are catalogued as MP3 and hold something else.
 */
export async function resolveArchiveTrack(item, genre) {
  let meta;
  try {
    meta = await getJson(`${ARCHIVE_HOST}/metadata/${encodeURIComponent(item.identifier)}`);
  } catch {
    return null;
  }

  const mp3 = (meta.files ?? []).find((f) => f.name?.toLowerCase().endsWith(".mp3"));
  if (!mp3) return null;

  const creator = Array.isArray(item.creator) ? item.creator[0] : item.creator;
  const title = Array.isArray(item.title) ? item.title[0] : item.title;

  return {
    source: "archive",
    sourceId: item.identifier,
    title: String(title || item.identifier).slice(0, 300),
    artist: String(creator || "Unknown").slice(0, 200),
    genre,
    durationSeconds: mp3.length ? Math.round(Number(mp3.length)) || null : null,
    audioUrl: `${ARCHIVE_HOST}/download/${encodeURIComponent(item.identifier)}/${encodeURIComponent(mp3.name)}`,
    artworkUrl: `${ARCHIVE_HOST}/services/img/${encodeURIComponent(item.identifier)}`,
  };
}
