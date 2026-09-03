import path from "node:path";

const METADATA_TIMEOUT_MS = Number(process.env.TORRENT_METADATA_TIMEOUT_MS || 60000);
const STARTUP_BUFFER_MB = Number(process.env.TORRENT_STARTUP_BUFFER_MB || 4);
const STARTUP_TIMEOUT_MS = Number(process.env.TORRENT_STARTUP_TIMEOUT_MS || 12000);
const MAX_CONNECTIONS = Number(process.env.TORRENT_MAX_CONNS || 80);

const STARTUP_BUFFER_BYTES = Math.max(1, STARTUP_BUFFER_MB) * 1024 * 1024;
const BROWSER_VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".m4v", ".mov"]);

let WebTorrentCtor = null;
let client = null;
const pendingLoads = new Map();

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export function torrentRuntimeStatus() {
  if (isServerlessRuntime()) {
    return {
      available: false,
      mode: "serverless",
      reason: "Torrent playback needs a long-lived Node process. Run the OnionTV server locally or on a VPS.",
    };
  }

  return {
    available: true,
    mode: "persistent-node",
    reason: null,
  };
}

async function getClient() {
  const status = torrentRuntimeStatus();
  if (!status.available) {
    const error = new Error(status.reason);
    error.code = "TORRENT_RUNTIME_UNAVAILABLE";
    throw error;
  }

  if (client && !client.destroyed) return client;

  if (!WebTorrentCtor) {
    const mod = await import("webtorrent");
    WebTorrentCtor = mod.default;
  }

  client = new WebTorrentCtor({ maxConns: MAX_CONNECTIONS });
  client.on("error", (error) => {
    console.error("WEBTORRENT ERROR:", error);
  });

  return client;
}

export async function getLoadedTorrent(id) {
  const wt = await getClient();
  try {
    return (await wt.get(id)) || null;
  } catch {
    return null;
  }
}

export async function loadTorrent(magnet) {
  if (typeof magnet !== "string" || !magnet.startsWith("magnet:")) {
    throw new Error("A valid magnet URI is required.");
  }

  const wt = await getClient();
  if (pendingLoads.has(magnet)) return pendingLoads.get(magnet);

  const existing = await wt.get(magnet);
  if (existing?.files?.length) return existing;

  const loadPromise = new Promise((resolve, reject) => {
    let settled = false;
    let addedTorrent = null;

    const cleanupFailedTorrent = () => {
      if (!addedTorrent) return;
      wt.remove(addedTorrent.infoHash || magnet).catch(() => {});
    };

    const finish = (error, torrent) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (error) {
        cleanupFailedTorrent();
        reject(error);
      } else {
        resolve(torrent);
      }
    };

    const timer = setTimeout(() => {
      const error = new Error("Torrent metadata timed out. No usable peers were found.");
      error.code = "TORRENT_METADATA_TIMEOUT";
      finish(error);
    }, METADATA_TIMEOUT_MS);

    try {
      addedTorrent = wt.add(magnet, (torrent) => finish(null, torrent));
      addedTorrent.once("error", (error) => finish(error));
      addedTorrent.on("noPeers", (type) => {
        console.warn(`Torrent has no peers via ${type}`);
      });
    } catch (error) {
      finish(error);
    }
  });

  pendingLoads.set(magnet, loadPromise);
  try {
    return await loadPromise;
  } finally {
    pendingLoads.delete(magnet);
  }
}

export function serializeFiles(torrent) {
  return torrent.files.map((file, index) => ({
    index,
    name: file.name,
    path: file.path,
    size: file.length,
    mime: file.type,
    downloaded: file.downloaded,
    progress: file.progress,
    browserPlayable: BROWSER_VIDEO_EXTENSIONS.has(path.extname(file.name).toLowerCase()),
  }));
}

export function chooseBrowserPlayableFile(torrent) {
  const candidates = torrent.files
    .map((file, index) => ({
      file,
      index,
      ext: path.extname(file.name).toLowerCase(),
    }))
    .filter(({ ext }) => BROWSER_VIDEO_EXTENSIONS.has(ext))
    .sort((a, b) => b.file.length - a.file.length);

  if (!candidates.length) {
    const error = new Error(
      "This torrent has no browser-playable MP4/WebM/M4V/MOV file. Transcoding is not configured."
    );
    error.code = "NO_BROWSER_PLAYABLE_FILE";
    throw error;
  }

  return candidates[0];
}

export async function warmFile(file) {
  const size = Math.min(STARTUP_BUFFER_BYTES, file.length);
  if (size <= 0) return { bytes: 0, completed: true };

  return new Promise((resolve) => {
    let received = 0;
    let finished = false;

    const stream = file.createReadStream({
      start: 0,
      end: size - 1,
    });

    const finish = (completed) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        stream.destroy();
      } catch {
        // Ignore cleanup errors.
      }
      resolve({ bytes: received, completed });
    };

    const timer = setTimeout(() => finish(false), STARTUP_TIMEOUT_MS);
    stream.on("data", (chunk) => {
      received += chunk.length;
    });
    stream.on("end", () => finish(true));
    stream.on("error", () => finish(false));
  });
}

export async function prepareMagnetPlayback(magnet) {
  const torrent = await loadTorrent(magnet);

  for (const file of torrent.files) {
    try {
      file.deselect();
    } catch {
      // Some WebTorrent stores may already have implicit selections.
    }
  }

  const { file, index } = chooseBrowserPlayableFile(torrent);
  file.select(10);
  const warmup = await warmFile(file);

  return {
    torrent,
    file,
    fileIndex: index,
    warmup,
    streamPath: `/api/torrent/stream/${torrent.infoHash}/${index}`,
  };
}

function pipeFileStream(res, stream) {
  const destroy = () => {
    try {
      stream.destroy();
    } catch {
      // Ignore cleanup errors.
    }
  };

  res.once("close", destroy);
  stream.once("end", () => res.removeListener("close", destroy));
  stream.once("error", (error) => {
    res.removeListener("close", destroy);
    if (!res.headersSent) res.status(500).end();
    else res.destroy(error);
  });
  stream.pipe(res);
}

export async function streamTorrentFile(req, res) {
  const torrent = await getLoadedTorrent(req.params.infoHash);
  if (!torrent) {
    return res.status(404).json({ error: "Torrent is not loaded in this process." });
  }

  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= torrent.files.length) {
    return res.status(404).json({ error: "Torrent file not found." });
  }

  const file = torrent.files[index];
  const total = file.length;
  const range = req.headers.range;
  const contentType = file.type || "application/octet-stream";

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");

  if (!range) {
    res.status(200);
    res.setHeader("Content-Length", total);
    return pipeFileStream(res, file.createReadStream());
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) {
    res.status(416);
    res.setHeader("Content-Range", `bytes */${total}`);
    return res.end();
  }

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : total - 1;

  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2]);
    start = Math.max(total - suffixLength, 0);
    end = total - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= total
  ) {
    res.status(416);
    res.setHeader("Content-Range", `bytes */${total}`);
    return res.end();
  }

  end = Math.min(end, total - 1);
  const chunkSize = end - start + 1;

  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
  res.setHeader("Content-Length", chunkSize);

  return pipeFileStream(res, file.createReadStream({ start, end }));
}

export async function getTorrentStatus(infoHash) {
  const torrent = await getLoadedTorrent(infoHash);
  if (!torrent) return null;

  return {
    name: torrent.name,
    infoHash: torrent.infoHash,
    peers: torrent.numPeers,
    progress: torrent.progress,
    progressPercent: Number((torrent.progress * 100).toFixed(2)),
    downloaded: torrent.downloaded,
    downloadSpeed: torrent.downloadSpeed,
    uploadSpeed: torrent.uploadSpeed,
    timeRemaining: torrent.timeRemaining,
    files: serializeFiles(torrent),
  };
}

export async function removeTorrent(infoHash) {
  const wt = await getClient();
  const torrent = await wt.get(infoHash);
  if (!torrent) return false;
  await wt.remove(infoHash);
  return true;
}

export async function destroyTorrentClient() {
  pendingLoads.clear();
  if (!client || client.destroyed) return;
  await client.destroy();
  client = null;
}
