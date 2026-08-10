// Video hosting/streaming client — placeholder until a provider key is added.
// Set VIDEO_PROVIDER in server/.env to "cloudflare" or "jwplayer", fill in
// the matching keys, then implement the provider block below it routes to.
// Until VIDEO_PROVIDER is set, playback URLs pass through unchanged (current
// DB-stored `playbackUrl` behavior, nothing breaks).

const VIDEO_PROVIDER = process.env.VIDEO_PROVIDER;

// Cloudflare Stream — https://developers.cloudflare.com/stream/
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_STREAM_API_TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN;

// JW Player — https://developer.jwplayer.com/jwplayer/docs
const JWPLAYER_API_KEY = process.env.JWPLAYER_API_KEY;
const JWPLAYER_API_SECRET = process.env.JWPLAYER_API_SECRET;

export function getConfiguredVideoProvider() {
  return VIDEO_PROVIDER || null;
}

// Resolves the playback URL to hand back to the client. `storedUrl` is
// whatever's in the DB's playbackUrl column today.
export async function resolvePlaybackUrl(storedUrl) {
  if (!VIDEO_PROVIDER) return storedUrl;

  if (VIDEO_PROVIDER === "cloudflare") {
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_STREAM_API_TOKEN) {
      throw new Error("VIDEO_PROVIDER=cloudflare but CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_STREAM_API_TOKEN are missing in server/.env.");
    }
    // TODO: implement, e.g. resolve `storedUrl` as a Cloudflare Stream video
    // UID and fetch its signed/HLS playback URL:
    // const res = await fetch(
    //   `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${storedUrl}`,
    //   { headers: { Authorization: `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}` } }
    // );
    // const data = await res.json();
    // return data.result.playback.hls;
    throw new Error("Cloudflare Stream integration not implemented yet — see TODO in videoProvider.js.");
  }

  if (VIDEO_PROVIDER === "jwplayer") {
    if (!JWPLAYER_API_KEY || !JWPLAYER_API_SECRET) {
      throw new Error("VIDEO_PROVIDER=jwplayer but JWPLAYER_API_KEY / JWPLAYER_API_SECRET are missing in server/.env.");
    }
    // TODO: implement JW Player Delivery API lookup for `storedUrl` (media id).
    throw new Error("JW Player integration not implemented yet — see TODO in videoProvider.js.");
  }

  throw new Error(`Unknown VIDEO_PROVIDER "${VIDEO_PROVIDER}" — expected "cloudflare" or "jwplayer".`);
}
