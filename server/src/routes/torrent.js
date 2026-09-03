import { Router } from "express";
import {
  getTorrentStatus,
  loadTorrent,
  prepareMagnetPlayback,
  removeTorrent,
  serializeFiles,
  streamTorrentFile,
  torrentRuntimeStatus,
} from "../services/torrentEngine.js";

const router = Router();

function mapTorrentError(res, error) {
  const unavailable =
    error?.code === "TORRENT_RUNTIME_UNAVAILABLE" ||
    error?.code === "ERR_MODULE_NOT_FOUND";

  return res.status(unavailable ? 503 : 500).json({
    error: error?.message || "Torrent engine error.",
    runtime: torrentRuntimeStatus(),
  });
}

router.get("/health", (req, res) => {
  res.json({
    ok: torrentRuntimeStatus().available,
    runtime: torrentRuntimeStatus(),
  });
});

// Accepts only a magnet supplied by your own catalog/admin tooling.
// This route intentionally does not search third-party torrent indexes.
router.post("/load", async (req, res) => {
  try {
    const magnet = String(req.body?.magnet || "").trim();
    if (!magnet.startsWith("magnet:")) {
      return res.status(400).json({ error: "Valid magnet URI required." });
    }

    const torrent = await loadTorrent(magnet);
    torrent.files.forEach((file) => {
      try {
        file.deselect();
      } catch {}
    });

    return res.json({
      name: torrent.name,
      infoHash: torrent.infoHash,
      size: torrent.length,
      peers: torrent.numPeers,
      files: serializeFiles(torrent),
    });
  } catch (error) {
    return mapTorrentError(res, error);
  }
});

router.post("/prepare", async (req, res) => {
  try {
    const magnet = String(req.body?.magnet || "").trim();
    if (!magnet.startsWith("magnet:")) {
      return res.status(400).json({ error: "Valid magnet URI required." });
    }

    const prepared = await prepareMagnetPlayback(magnet);
    return res.json({
      ok: true,
      name: prepared.file.name,
      infoHash: prepared.torrent.infoHash,
      fileIndex: prepared.fileIndex,
      size: prepared.file.length,
      downloaded: prepared.file.downloaded,
      progress: prepared.file.progress,
      warmupBytes: prepared.warmup.bytes,
      warmupComplete: prepared.warmup.completed,
      streamPath: prepared.streamPath,
    });
  } catch (error) {
    return mapTorrentError(res, error);
  }
});

router.get("/status/:infoHash", async (req, res) => {
  try {
    const status = await getTorrentStatus(req.params.infoHash);
    if (!status) return res.status(404).json({ error: "Torrent not found." });
    return res.json(status);
  } catch (error) {
    return mapTorrentError(res, error);
  }
});

router.get("/stream/:infoHash/:index", async (req, res) => {
  try {
    return await streamTorrentFile(req, res);
  } catch (error) {
    return mapTorrentError(res, error);
  }
});

router.delete("/:infoHash", async (req, res) => {
  try {
    const removed = await removeTorrent(req.params.infoHash);
    if (!removed) return res.status(404).json({ error: "Torrent not found." });
    return res.json({ ok: true });
  } catch (error) {
    return mapTorrentError(res, error);
  }
});

export default router;
