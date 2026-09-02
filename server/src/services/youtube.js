/*
 * YouTube, as a music source.
 *
 * YouTube's own apps do not use the public Data API. They talk to an internal
 * JSON API called InnerTube: no key, no quota, but a request has to look like
 * it came from a real client, and media URLs come back with scrambled
 * signatures that only YouTube's player script knows how to undo.
 * NewPipeExtractor implements that protocol by hand in Java; `youtubei.js` is
 * the same protocol in JavaScript, and this file is a thin layer over it.
 *
 * This is now the only source. There was a second one — PeerTube, whose
 * instances hand out their own media files — behind a `MUSIC_SOURCE` selector;
 * both are gone. Everything here returns the shape the rest of the app speaks:
 * { source, sourceId, title, artist, artworkUrl, durationSeconds, genre,
 * audioUrl }.
 *
 * Metadata is what this does well. YouTube Music's catalogue is the one the
 * Indian labels actually publish to, and a search gives back songs with the
 * artist, the album and square cover art already separated out.
 *
 * The audio is a different question. `resolveFileUrl` below hands the stream
 * proxy a real media URL, on a deployment as much as on a laptop; there is no
 * licence behind those bytes, and the gate that used to keep this to local
 * development was removed deliberately. See the header of
 * controllers/streamController.js.
 */
import { Innertube, UniversalCache } from "youtubei.js";

// No real chart endpoint survives across regions, so the home row is seeded
// with a query when YouTube's own music home feed is unavailable.
const TRENDING_QUERY = () => process.env.YOUTUBE_TRENDING_QUERY || "top hindi songs 2026";

const SESSION_CACHE_DIR = process.env.YOUTUBE_CACHE_DIR || "./.yt-session";

/* ------------------------------------------------------------ the session */

let sessionPromise = null;

/*
 * One InnerTube session per process, created lazily.
 *
 * Creating it costs a couple of round trips: it fetches YouTube's own player
 * script and extracts the signature functions from it, which is what makes
 * media URLs decipherable at all. Doing that per request would be slow and
 * would look like a bot. UniversalCache keeps it between restarts.
 */
async function session() {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    try {
      return await Innertube.create({
        cache: new UniversalCache(true, SESSION_CACHE_DIR),
      });
    } catch (e) {
      console.warn("UniversalCache failed, falling back to memory session:", e.message);
      return await Innertube.create();
    }
  })();
  return sessionPromise;
}

/* -------------------------------------------------------------- the cache */

/*
 * A small in-process memo with a TTL.
 *
 * The Track table already caches results for the front end; this is a
 * different job — it stops a burst of identical requests from becoming a burst
 * of identical requests to YouTube, which is what earns a 429 mid-demo. It is
 * deliberately in memory rather than on disk: this app also runs on Vercel,
 * where a writable disk is not something to count on.
 */
const TTL = { search: 6 * 60 * 60_000, trending: 30 * 60_000, stream: 90 * 60_000 };
const memo = new Map();

async function remember(key, ttl, produce) {
  const hit = memo.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await produce();
  // An empty result is almost always YouTube having a bad minute. Caching it
  // would keep the app broken for six hours over a blip.
  if (Array.isArray(value) && value.length === 0) return value;
  if (value === null || value === undefined) return value;

  memo.set(key, { value, expires: Date.now() + ttl });
  if (memo.size > 500) {
    for (const [k, v] of memo) if (v.expires <= Date.now()) memo.delete(k);
  }
  return value;
}

/* --------------------------------------------------------- normalisation */

const textOf = (v) => (typeof v === "string" ? v : v?.text ?? "");

/*
 * YouTube's image host takes the size in the URL, so the 60px cover that comes
 * back in a search result can be asked for at 544px without a second request.
 * Left alone when the URL is not in that shape.
 */
function bigArtwork(url) {
  if (!url) return null;
  return url.replace(/=w\d+-h\d+/, "=w544-h544").replace(/\/w\d+-h\d+\//, "/w544-h544/");
}

function pickThumb(item) {
  const raw = item?.thumbnail?.contents || item?.thumbnails || item?.thumbnail || [];
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) return null;
  const widest = list.reduce((a, b) => ((b?.width || 0) > (a?.width || 0) ? b : a), list[0]);
  return bigArtwork(widest?.url) || null;
}

/*
 * One result, in the shape the rest of this app already speaks. Nothing above
 * services/ should ever see a youtubei.js object — keeping the translation in
 * one function is what lets the source be swapped without touching a
 * controller.
 */
function toTrack(item) {
  const sourceId = item?.video_id || item?.id;
  if (!sourceId || typeof sourceId !== "string") return null;
  // Exclude playlist and browse IDs (e.g. VL..., PL..., MPRE..., RD..., OLAK...) or IDs > 20 chars
  if (/^(VL|PL|MPRE|OLAK|RDCLAK)/.test(sourceId) || sourceId.length > 20) {
    return null;
  }

  const artists = Array.isArray(item?.artists) ? item.artists : [];
  const artist =
    artists.map((a) => textOf(a?.name)).filter(Boolean).join(", ") ||
    textOf(item?.author?.name) ||
    textOf(item?.subtitle) ||
    "Unknown";

  return {
    source: "youtube",
    sourceId,
    title: textOf(item?.title) || "Untitled",
    artist,
    artworkUrl: pickThumb(item),
    durationSeconds: item?.duration?.seconds ?? null,
    genre: null,
    // Resolved at play time rather than now: a page of thirty results would
    // otherwise spend thirty requests on audio nobody has asked to hear.
    audioUrl: null,
  };
}

function toAlbum(item) {
  const sourceId = item?.playlist_id || item?.id || item?.browse_id;
  if (!sourceId || typeof sourceId !== "string") return null;
  const artists = Array.isArray(item?.artists) ? item.artists : [];
  return {
    source: "youtube",
    // An album is not a playable track, and the page has to be able to tell:
    // clicking one must search it, not hand its id to the stream endpoint.
    kind: "album",
    sourceId,
    title: textOf(item?.title) || "Untitled",
    artist:
      artists.map((a) => textOf(a?.name)).filter(Boolean).join(", ") ||
      textOf(item?.author?.name) ||
      textOf(item?.subtitle) ||
      "Unknown",
    artworkUrl: pickThumb(item),
    durationSeconds: null,
    genre: null,
    audioUrl: null,
  };
}

/*
 * A search response is a list of shelves — "Songs", "Albums", "Community
 * playlists" — and which shelves come back depends on the query and on which
 * A/B bucket the request landed in. Rather than reaching down one known path,
 * every plausible container is flattened and items are kept only if they
 * normalised into something with an id.
 */
function harvest(response) {
  const buckets = [
    response?.contents,
    response?.results,
    response?.songs?.contents,
    response?.albums?.contents,
    response?.videos?.contents,
    response?.sections,
  ].filter(Boolean);

  const out = [];
  for (const bucket of buckets) {
    for (const entry of Array.isArray(bucket) ? bucket : [bucket]) {
      if (Array.isArray(entry?.contents)) out.push(...entry.contents);
      else if (entry) out.push(entry);
    }
  }
  return out;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((t) => t && !seen.has(t.sourceId) && seen.add(t.sourceId));
}

/* ---------------------------------------------------------- the interface */

/*
 * Search runs against YouTube *Music*, not plain YouTube. That is worth more
 * than it sounds: music search returns songs with the artist, album and square
 * cover art already separated, where a normal video search returns uploads
 * whose "artist" is a channel called "T-Series Official" and whose art is a
 * 16:9 frame with a face in it.
 */
export async function searchVideos({ query, limit = 25 } = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  return remember(`songs:${q.toLowerCase()}:${limit}`, TTL.search, async () => {
    const yt = await session();
    const found = await yt.music.search(q, { type: "song" });
    return dedupe(harvest(found).map(toTrack).filter(Boolean)).slice(0, limit);
  });
}

/** Albums, with their own ids, artist and cover art. */
export async function searchAlbums({ query, limit = 25 } = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  return remember(`albums:${q.toLowerCase()}:${limit}`, TTL.search, async () => {
    const yt = await session();
    const found = await yt.music.search(q, { type: "album" });
    return dedupe(harvest(found).map(toAlbum).filter(Boolean)).slice(0, limit);
  });
}

/**
 * The home row. YouTube's music home feed is tried first and a seeded search is
 * the floor — the front page having something on it matters more than it being
 * a real chart, and there is no chart endpoint worth depending on.
 */
export async function fetchTrending({ limit = 50 } = {}) {
  return remember(`trending:${limit}`, TTL.trending, async () => {
    const yt = await session();
    try {
      const feed = await yt.music.getHomeFeed();
      const picked = dedupe(harvest(feed).map(toTrack).filter(Boolean));
      if (picked.length >= 8) return picked.slice(0, limit);
    } catch (error) {
      console.warn("fetchTrending home feed unavailable:", error.message);
    }
    return searchVideos({ query: TRENDING_QUERY(), limit });
  });
}

/**
 * Songs like this one.
 *
 * The good answer is YouTube's own radio queue for the track that just played —
 * it is what autoplay uses, and it beats anything a search produces. It needs
 * the video id, which the front end sends as `exclude`. When that is missing or
 * the call fails, searching the artist is the stand-in: not a recommender, but
 * songs by someone the listener has demonstrably just chosen.
 */
export async function searchRelated({ title, artist, exclude, limit = 25 } = {}) {
  const key = `related:${exclude || `${title}|${artist}`}:${limit}`;

  return remember(key, TTL.search, async () => {
    if (exclude) {
      try {
        const yt = await session();
        const upNext = await yt.music.getUpNext(exclude);
        const queue = dedupe(harvest(upNext).map(toTrack).filter(Boolean)).filter(
          (t) => t.sourceId !== exclude
        );
        if (queue.length >= 5) return queue.slice(0, limit);
      } catch (error) {
        console.warn("searchRelated up-next unavailable:", error.message);
      }
    }

    const query = [artist, String(title || "").split(/[|\-–—([]/)[0]].filter(Boolean).join(" ").trim();
    if (!query) return [];
    const found = await searchVideos({ query, limit: limit + 6 });
    return found.filter((t) => t.sourceId !== exclude).slice(0, limit);
  });
}

/**
 * Where the bytes are.
 *
 * Returns null rather than throwing, so a track that cannot be resolved takes
 * the stream endpoint's ordinary "no playable audio" path instead of a 500.
 * The IOS client is asked for deliberately: it is handed plain audio-only
 * formats, where the web client is handed DASH manifests an <audio> element
 * cannot play.
 */
export async function resolveFileUrl(sourceId) {
  const id = String(sourceId || "").trim();
  if (!/^[\w-]{6,20}$/.test(id)) return null;

  return remember(`stream:${id}`, TTL.stream, async () => {
    try {
      const yt = await session();
      const info = await yt.getBasicInfo(id, "IOS");
      const format = info.chooseFormat({ type: "audio", quality: "best" });
      if (format) {
        return format.decipher(yt.session.player) || null;
      }
    } catch (err) {
      console.warn("resolveFileUrl IOS failed, attempting fallback:", err.message);
      try {
        const freshYt = await Innertube.create();
        const info = await freshYt.getBasicInfo(id, "IOS");
        const format = info.chooseFormat({ type: "audio", quality: "best" });
        if (format) return format.decipher(freshYt.session.player) || null;
      } catch (fallbackErr) {
        console.warn("resolveFileUrl fallback failed:", fallbackErr.message);
      }
    }
    return null;
  });
}
