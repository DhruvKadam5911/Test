import prisma from "../config/db.js";
import { resolveFileUrl } from "../services/musicSource.js";
import { isStreamProxyEnabled, streamProxyRefusal } from "../services/youtube.js";

/*
 * Streaming a track's audio.
 *
 * The player is a plain <audio> element, which is the only thing that keeps
 * playing when a phone's screen goes off — an embedded player in an iframe is
 * suspended by the browser, whatever the page does. That element needs bytes
 * from somewhere, and this is where it asks.
 *
 * What this is: a proxy in front of whatever URL the catalog holds for a track.
 * That keeps the source out of the client, so storage can move, URLs can be
 * signed, and none of it reaches the browser.
 *
 * What this is not, and must not become: a public way to pull audio out of
 * YouTube. Serving those bytes from a deployed instance is redistributing music
 * nobody licensed, and this proxy would be the thing doing it. That has been
 * the rule here since this file was written and it still is.
 *
 * What changed, and exactly how far: a YouTube row can now resolve a file on a
 * developer's own machine, behind YOUTUBE_STREAM_PROXY=1, and never when
 * NODE_ENV=production — enough to run and demonstrate the project locally,
 * refused everywhere it would be a service. The gate is one function,
 * `isStreamProxyEnabled()` in services/youtube.js; if you are about to widen
 * it, read its header first. A deployed instance still answers 409 for YouTube
 * rows, which is what it did before.
 *
 * Two details the element depends on, either of which silently breaks playback:
 *
 *   1. Range requests. iOS opens with `Range: bytes=0-1` and refuses to play if
 *      it gets a 200 back, so a Range in means a 206 and a Content-Range out.
 *   2. A real audio Content-Type, passed through from upstream.
 */

// A stalled upstream should fail rather than hold the invocation to its limit.
const TIMEOUT_MS = 20_000;

async function findTrack(id) {
  const [row] = await prisma.$queryRaw`
    SELECT id, title, "audioUrl", source, "sourceId"
    FROM "Track"
    WHERE id = ${id} OR "sourceId" = ${id}
    LIMIT 1`;
  return row || null;
}

// GET /music/stream/:id
export async function streamTrack(req, res) {
  const { id } = req.params;

  let track;
  try {
    track = await findTrack(id);
  } catch (error) {
    if (/does not exist/i.test(error.message)) return res.status(404).json({ error: "No tracks yet." });
    console.error("streamTrack lookup error:", error);
    return res.status(500).json({ error: "Failed to look up that track." });
  }

  if (!track) return res.status(404).json({ error: "Track not found." });

  /*
   * A row is stored without a file URL: finding it costs a request per video,
   * and a page of results would spend thirty of them on files nobody has asked
   * to hear. It is resolved on the first play instead.
   *
   * Only a PeerTube URL is written back. A YouTube one is signed and expires
   * within hours, so persisting it would leave the row holding a URL that is
   * dead the next day and never resolved again — the track would play once and
   * be broken from then on. Those are held in memory by services/youtube.js
   * for well under their own lifetime instead.
   */
  if (!track.audioUrl && track.source === "youtube" && !isStreamProxyEnabled()) {
    return res.status(409).json({ error: streamProxyRefusal() });
  }

  if (!track.audioUrl && (track.source === "peertube" || track.source === "youtube")) {
    try {
      const resolved = await resolveFileUrl(track.source, track.sourceId);
      if (resolved) {
        if (track.source === "peertube") {
          await prisma.$executeRaw`UPDATE "Track" SET "audioUrl" = ${resolved} WHERE id = ${track.id}`;
        }
        track = { ...track, audioUrl: resolved };
      }
    } catch (error) {
      console.error("streamTrack resolve error:", error.message);
    }
  }

  if (!track.audioUrl) {
    return res.status(409).json({
      error: "That track's instance did not offer a playable file.",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // A client that gives up mid-song should take the upstream request with it.
  req.on("close", () => controller.abort());

  try {
    const range = req.headers.range;
    const upstream = await fetch(track.audioUrl, {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: range ? { Range: range } : {},
      signal: controller.signal,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}.` });
    }

    // Passed through rather than invented: the element believes these.
    /*
     * Not cached at the edge. A full response cached once was then served back
     * for Range requests as a 200, which is exactly the status iOS refuses to
     * play — the bytes were right and the status was not. Proxying is cheap
     * enough that a cache is not worth that failure mode.
     */
    const headers = { "Cache-Control": "no-store", "Accept-Ranges": "bytes" };
    for (const header of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(header);
      if (value) headers[header] = value;
    }

    // writeHead rather than res.status(): the status has to be the upstream's
    // own. A Range request answered with 200 instead of 206 is refused outright
    // by iOS, and it is exactly the kind of thing a framework helpfully
    // normalises away.
    res.writeHead(upstream.status, headers);
    if (req.method === "HEAD" || !upstream.body) return res.end();

    // Web stream to Node stream, a chunk at a time, so a long track is never
    // held in memory in one piece.
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise((resolve) => res.once("drain", resolve));
      }
    }
    return res.end();
  } catch (error) {
    if (error.name === "AbortError") return res.end();
    console.error("streamTrack error:", error);
    if (res.headersSent) return res.end();
    return res.status(502).json({ error: "Could not reach the audio." });
  } finally {
    clearTimeout(timer);
  }
}
