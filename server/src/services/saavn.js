import crypto from "node:crypto";

const DES_KEY_24 = Buffer.from("383465913834659138346591", "utf-8");
const SAAVN_BASE_URL = "https://www.jiosaavn.com/api.php";
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

function decodeHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function normalizeArtwork(url) {
  if (!url) return null;
  return url
    .replace("50x50.jpg", "500x500.jpg")
    .replace("150x150.jpg", "500x500.jpg")
    .replace("http://", "https://");
}

export function decryptMediaUrl(encryptedUrl, quality = "320") {
  if (!encryptedUrl) return null;
  try {
    const decipher = crypto.createDecipheriv("des-ede3", DES_KEY_24, "");
    decipher.setAutoPadding(true);
    let dec = decipher.update(encryptedUrl, "base64", "utf-8");
    dec += decipher.final("utf-8");
    if (!dec.startsWith("http")) return null;
    if (quality === "320") {
      return dec.replace("_96.mp4", "_320.mp4");
    }
    if (quality === "160") {
      return dec.replace("_96.mp4", "_160.mp4");
    }
    return dec;
  } catch (err) {
    console.warn("Saavn decrypt error:", err.message);
    return null;
  }
}

export function normalizeTrack(raw) {
  if (!raw) return null;
  const more = raw.more_info || {};
  const encrypted = more.encrypted_media_url || raw.encrypted_media_url;
  const streamUrl = decryptMediaUrl(encrypted, "320") || decryptMediaUrl(encrypted, "160") || decryptMediaUrl(encrypted, "96");

  const title = decodeHtml(raw.title || raw.song);
  const artist = decodeHtml(
    more.music ||
      raw.primary_artists ||
      raw.artist ||
      raw.singers ||
      raw.header_desc ||
      ""
  );
  const album = decodeHtml(more.album || raw.album || "");
  const artworkUrl = normalizeArtwork(raw.image || more.image);
  const durationSec = parseInt(more.duration || raw.duration || "0", 10) || null;
  const id = raw.id || raw.perma_url;

  return {
    id: `saavn_${id}`,
    source: "saavn",
    sourceId: String(id),
    title,
    artist,
    album,
    artworkUrl,
    streamUrl,
    durationSec,
  };
}

async function fetchSaavn(params) {
  const url = new URL(SAAVN_BASE_URL);
  url.searchParams.set("_format", "json");
  url.searchParams.set("_marker", "0");
  url.searchParams.set("api_version", "4");
  url.searchParams.set("ctx", "web6dot0");

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), { headers: DEFAULT_HEADERS });
  if (!res.ok) {
    throw new Error(`Saavn API returned status ${res.status}`);
  }
  return res.json();
}

/**
 * Search songs by query
 */
export async function searchSongs(query, { limit = 20, page = 1 } = {}) {
  try {
    const data = await fetchSaavn({
      __call: "search.getResults",
      q: query,
      n: limit,
      p: page,
    });
    const results = data.results || [];
    return results.map(normalizeTrack).filter((t) => t && t.streamUrl);
  } catch (err) {
    console.warn("Saavn searchSongs error:", err);
    return [];
  }
}

/**
 * Fetch top trending hits
 */
export async function fetchTrending({ limit = 20 } = {}) {
  const queries = [
    "Arijit Singh",
    "Top Bollywood 2026",
    "AP Dhillon",
    "English Pop Hits",
    "Badshah",
    "Anirudh Ravichander",
    "Trending India Hits",
  ];
  const randomQuery = queries[Math.floor(Math.random() * queries.length)];
  try {
    const data = await fetchSaavn({
      __call: "search.getResults",
      q: randomQuery,
      n: limit,
      p: 1,
    });
    const results = data.results || [];
    return results.map(normalizeTrack).filter((t) => t && t.streamUrl);
  } catch (err) {
    console.warn("Saavn fetchTrending error:", err);
    return [];
  }
}

/**
 * Search albums by query
 */
export async function searchAlbums(query, { limit = 12, page = 1 } = {}) {
  try {
    const data = await fetchSaavn({
      __call: "search.getAlbumResults",
      q: query,
      n: limit,
      p: page,
    });
    const results = data.results || [];
    return results.map((a) => ({
      id: `saavn_album_${a.id}`,
      source: "saavn",
      sourceId: String(a.id),
      title: decodeHtml(a.title),
      artist: decodeHtml(a.artist || a.music || a.header_desc || ""),
      artworkUrl: normalizeArtwork(a.image),
      year: a.year || null,
      trackCount: a.list_count ? parseInt(a.list_count, 10) : null,
    }));
  } catch (err) {
    console.warn("Saavn searchAlbums error:", err);
    return [];
  }
}

/**
 * Fetch album details with all track stream URLs
 */
export async function fetchAlbumDetails(albumId) {
  try {
    const data = await fetchSaavn({
      __call: "content.getAlbumDetails",
      albumid: albumId,
    });
    const list = data.list || data.songs || [];
    return {
      id: `saavn_album_${data.id}`,
      title: decodeHtml(data.title),
      artist: decodeHtml(data.primary_artists || data.artist || ""),
      artworkUrl: normalizeArtwork(data.image),
      tracks: list.map(normalizeTrack).filter((t) => t && t.streamUrl),
    };
  } catch (err) {
    console.warn("Saavn fetchAlbumDetails error:", err);
    return null;
  }
}

/**
 * Fetch related songs based on query / artist
 */
export async function fetchRelated(songTitleOrArtist, { limit = 15 } = {}) {
  try {
    return await searchSongs(songTitleOrArtist || "Top Music Hits", { limit });
  } catch (err) {
    console.warn("Saavn fetchRelated error:", err);
    return [];
  }
}
