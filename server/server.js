// Local/VPS development entry point. Vercel does not use this file — it invokes
// api/index.js per request instead, so long-lived torrent playback is available
// only when this persistent Node process is running.
import "dotenv/config";
import app from "./app.js";
import { destroyTorrentClient } from "./src/services/torrentEngine.js";

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Onion VOD server running on http://localhost:${PORT}`);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n${signal} received. Closing Onion VOD server...`);

  try {
    await destroyTorrentClient();
  } catch (error) {
    console.warn("Torrent client shutdown warning:", error.message);
  }

  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
