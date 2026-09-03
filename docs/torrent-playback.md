# OnionTV persistent torrent playback

This integration is for content you are authorized to distribute, such as your own media or public-domain / Creative Commons torrents.

## Runtime model

The normal OnionTV API remains Vercel-compatible. Torrent playback is different: a BitTorrent client needs a long-lived Node process so peer connections and torrent state survive between HTTP range requests.

Use torrent playback with:

- local development (`node server/server.js` / `npm start` inside `server/`), or
- a persistent Node/VPS deployment.

On Vercel/serverless, `/api/torrent/health` reports the torrent runtime as unavailable instead of hanging or opening a second listener.

## Install

From the repository root:

```bash
npm install
```

If you run the backend from its own package directory:

```bash
cd server
npm install
```

Then start the backend:

```bash
npm start
```

The default API is `http://localhost:5000`.

## Health check

```bash
curl http://localhost:5000/api/torrent/health
```

Expected persistent-runtime response:

```json
{
  "ok": true,
  "runtime": {
    "available": true,
    "mode": "persistent-node",
    "reason": null
  }
}
```

## Public Creative Commons smoke test

WebTorrent's own documentation uses Blender Foundation's Creative Commons film **Sintel** as a test torrent.

```text
magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent
```

Prepare it:

```bash
curl -X POST http://localhost:5000/api/torrent/prepare \
  -H "Content-Type: application/json" \
  -d '{"magnet":"PASTE_SINTEL_MAGNET_HERE"}'
```

The response contains an `infoHash`, `fileIndex`, warmup details and a `streamPath` such as:

```text
/api/torrent/stream/<infoHash>/<fileIndex>
```

Open the absolute version of that URL through the backend, or let OnionTV's normal `/titles/:id/playback` endpoint return it to `WatchPage`.

## Use through the existing OnionTV catalog

No frontend rewrite is required. `WatchPage` already requests:

```text
GET /titles/:id/playback
```

For a title you own or are allowed to distribute, store its magnet URI in the existing `playbackUrl` field. The resolver now behaves like this:

- `https://...` → unchanged existing playback behavior
- `magnet:...` → prepare torrent, choose the largest browser-playable video, warm its first bytes, return an OnionTV stream URL

Series episodes work the same way through `Episode.playbackUrl`.

## Browser format support

The torrent resolver deliberately chooses only files ending in:

- `.mp4`
- `.webm`
- `.m4v`
- `.mov`

A torrent containing only MKV/AVI is rejected with a clear message because a normal HTML `<video>` element commonly fails on those containers/codecs. Add an FFmpeg/transcoding layer separately if you need those formats.

## API routes

- `GET /api/torrent/health`
- `POST /api/torrent/load`
- `POST /api/torrent/prepare`
- `GET /api/torrent/status/:infoHash`
- `GET /api/torrent/stream/:infoHash/:index`
- `DELETE /api/torrent/:infoHash`

The stream route supports HTTP byte-range requests (`206 Partial Content`), so browser seeking can request only the needed part of the selected file.
