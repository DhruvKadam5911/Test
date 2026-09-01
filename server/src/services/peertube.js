/*
 * PeerTube, as the music source.
 *
 * The reason for the move: PeerTube hands out the media file itself. Every
 * limit the YouTube embed imposed came from never having the file —
 *
 *   - playback stopped when a phone's screen locked, because a cross-origin
 *     iframe is suspended and YouTube gates background audio behind Premium;
 *   - tempo was fixed to the rates the player advertised and pitch could not be
 *     touched at all, because no Web Audio reaches into that iframe;
 *   - a good share of the catalogue simply refused to play, because rights
 *     holders turn embedding off — and those were the uploads worth playing.
 *
 * A file URL removes all three at once. It plays in an <audio> element the page
 * owns, which survives a locked screen, takes any playback rate, and can be
 * routed through Web Audio for real pitch shifting.
 *
 * Two hosts are in play. Search runs against SepiaSearch, which indexes videos
 * across the whole PeerTube network, so there is a catalogue before anyone runs
 * an instance. The files themselves live on whichever instance published them,
 * which is why a track's id carries its host.
 */

const SEARCH_HOST = () => process.env.PEERTUBE_SEARCH_HOST || "https://sepiasearch.org";
// Set this to your own instance to search only it — useful once there is one.
const OWN_HOST = () => process.env.PEERTUBE_HOST || "";
const TIMEOUT_MS = 12_000;

export function isPeertubeConfigured() {
  // Nothing to configure: the public search index needs no key. Kept so
  // callers can ask the same question they asked of the old source.
  return true;
}

async function get(host, path, params = {}) {
  const url = new URL(`${host}/api/v1${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`PeerTube ${path} failed: ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/*
 * A track's id is `host|uuid`.
 *
 * The file lives on the instance that published it, so the host has to travel
 * with the id — there is no single origin to resolve against later.
 */
export function packId(host, uuid) {
  return `${host}|${uuid}`;
}

export function unpackId(id) {
  const [host, uuid] = String(id).split("|");
  return { host, uuid };
}

function hostOf(video) {
  const host = video?.account?.host || video?.channel?.host;
  return host ? `https://${host}` : null;
}

function toTrack(video) {
  const host = hostOf(video);
  if (!host || !video.uuid) return null;

  return {
    source: "peertube",
    sourceId: packId(host, video.uuid),
    title: video.name || "Untitled",
    artist: video.account?.displayName || video.channel?.displayName || "Unknown",
    artworkUrl: video.thumbnailPath ? `${host}${video.thumbnailPath}` : null,
    durationSeconds: video.duration ?? null,
    genre: null,
    // Resolved at play time rather than now: the file list needs a request per
    // video, and a page of thirty results would be thirty requests for files
    // nobody has asked to hear yet.
    audioUrl: null,
  };
}

/** Search the network, or one instance if PEERTUBE_HOST is set. */
export async function searchVideos({ query, limit = 25 } = {}) {
  const own = OWN_HOST();
  const data = own
    ? await get(own, "/search/videos", { search: query, count: Math.min(limit, 50) })
    : await get(SEARCH_HOST(), "/search/videos", { search: query, count: Math.min(limit, 50) });

  return (data.data ?? []).map(toTrack).filter(Boolean);
}

/** What is being watched right now — the closest thing here to a chart. */
export async function fetchTrending({ limit = 50 } = {}) {
  const own = OWN_HOST();
  const data = own
    ? await get(own, "/videos", { sort: "-trending", count: Math.min(limit, 50), nsfw: "false" })
    : await get(SEARCH_HOST(), "/search/videos", {
        search: "music",
        sort: "-publishedAt",
        count: Math.min(limit, 50),
      });

  return (data.data ?? []).map(toTrack).filter(Boolean);
}

/**
 * The playable file for a track, largest resolution last.
 *
 * A video may publish plain files, HLS renditions, or both. The plain file is
 * preferred: an <audio> element can play an mp4 directly, while an HLS playlist
 * needs a library to demux it.
 */
export async function resolveFileUrl(id) {
  const { host, uuid } = unpackId(id);
  if (!host || !uuid) return null;

  const video = await get(host, `/videos/${uuid}`);

  const direct = video.files ?? [];
  if (direct.length) return direct[direct.length - 1].fileUrl || null;

  const hls = (video.streamingPlaylists ?? []).flatMap((p) => p.files ?? []);
  if (hls.length) return hls[hls.length - 1].fileUrl || null;

  return null;
}

/**
 * Songs like this one.
 *
 * PeerTube has no "related" endpoint, so this searches the words of the title
 * and drops the video itself — the same shape the old source needed for the
 * same reason.
 */
export async function searchRelated({ title, exclude, limit = 25 } = {}) {
  const query = String(title || "").split(/[|\-–—([]/)[0].trim();
  if (!query) return [];

  const found = await searchVideos({ query, limit: 50 });
  return found.filter((t) => t.sourceId !== exclude).slice(0, limit);
}
