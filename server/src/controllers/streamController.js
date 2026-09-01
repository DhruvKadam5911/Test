import prisma from "../config/db.js";

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
 * What this is not, and must not become: a way to pull audio out of YouTube.
 * Rows imported from YouTube carry no `audioUrl` and are refused below. Serving
 * their audio from here would be redistributing music nobody licensed, and the
 * proxy would be the thing doing it.
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
    SELECT id, title, "audioUrl", source
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

  if (!track.audioUrl) {
    // The honest failure, and the common one: everything imported from YouTube
    // is metadata. The player shows this rather than sitting on a dead element.
    return res.status(409).json({
      error:
        track.source === "youtube"
          ? "This track came from YouTube, which supplies metadata but no audio file."
          : "This track has no audio file.",
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
    const headers = { "Cache-Control": "public, max-age=3600", "Accept-Ranges": "bytes" };
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
