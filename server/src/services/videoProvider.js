// Video hosting/streaming resolver.
//
// Normal http(s) playback URLs keep the existing behavior.
// For lawful/public-domain content, a catalog entry may store a magnet URI.
// Magnet playback is supported only in a persistent Node runtime (local/VPS),
// because Vercel/serverless functions do not keep torrent peer connections alive.

import { prepareMagnetPlayback, torrentRuntimeStatus } from "./torrentEngine.js";

const VIDEO_PROVIDER = process.env.VIDEO_PROVIDER;

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_STREAM_API_TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN;

const JWPLAYER_API_KEY = process.env.JWPLAYER_API_KEY;
const JWPLAYER_API_SECRET = process.env.JWPLAYER_API_SECRET;

export function getConfiguredVideoProvider() {
  return VIDEO_PROVIDER || null;
}

function joinBaseUrl(baseUrl, streamPath) {
  if (!baseUrl) return streamPath;
  return `${baseUrl.replace(/\/+$/, "")}${streamPath}`;
}

export async function resolvePlaybackUrl(storedUrl, { baseUrl = "" } = {}) {
  const source = String(storedUrl || "").trim();
  if (!source) {
    throw new Error("No playback source is configured for this title.");
  }

  if (source.startsWith("magnet:")) {
    const runtime = torrentRuntimeStatus();
    if (!runtime.available) {
      throw new Error(runtime.reason);
    }

    const prepared = await prepareMagnetPlayback(source);
    return joinBaseUrl(baseUrl, prepared.streamPath);
  }

  if (!VIDEO_PROVIDER) return source;

  if (VIDEO_PROVIDER === "cloudflare") {
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_STREAM_API_TOKEN) {
      throw new Error(
        "VIDEO_PROVIDER=cloudflare but CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_STREAM_API_TOKEN are missing in server/.env."
      );
    }

    throw new Error(
      "Cloudflare Stream integration not implemented yet — see TODO in videoProvider.js."
    );
  }

  if (VIDEO_PROVIDER === "jwplayer") {
    if (!JWPLAYER_API_KEY || !JWPLAYER_API_SECRET) {
      throw new Error(
        "VIDEO_PROVIDER=jwplayer but JWPLAYER_API_KEY / JWPLAYER_API_SECRET are missing in server/.env."
      );
    }

    throw new Error(
      "JW Player integration not implemented yet — see TODO in videoProvider.js."
    );
  }

  throw new Error(
    `Unknown VIDEO_PROVIDER "${VIDEO_PROVIDER}" — expected "cloudflare" or "jwplayer".`
  );
}
