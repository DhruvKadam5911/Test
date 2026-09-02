/*
 * Why is /music/tracks empty?
 *
 * getTracks catches a source failure and falls back to the Track table, which
 * is empty — so a broken scrape and a cold cache look identical from the
 * browser. This walks the same path with nothing swallowed.
 *
 *   node diagnose-music.mjs
 *
 * Scratch file. Delete it when the music page works.
 */
import "dotenv/config";

const show = (label, value) => console.log(`  ${label.padEnd(24)} ${value}`);
const fail = (step, error) => {
  console.log(`\n  ✗ ${step}\n`);
  console.log(`    ${error?.name || "Error"}: ${error?.message}`);
  if (error?.stack) console.log(error.stack.split("\n").slice(1, 5).map((l) => "    " + l.trim()).join("\n"));
  return null;
};

console.log("\n[1] Configuration\n");
show("MUSIC_SOURCE", process.env.MUSIC_SOURCE || "(unset -> peertube)");
show("YOUTUBE_STREAM_PROXY", process.env.YOUTUBE_STREAM_PROXY || "(unset -> audio off)");
show("NODE_ENV", process.env.NODE_ENV || "(unset -> development)");
if ((process.env.MUSIC_SOURCE || "peertube") !== "youtube") {
  console.log("\n  ! MUSIC_SOURCE is not \"youtube\", so /music/* is still answering from PeerTube.");
  console.log("    Set it in server/.env and restart the server.\n");
}

console.log("\n[2] Reaching YouTube at all\n");
try {
  const res = await fetch("https://music.youtube.com/", { method: "HEAD" });
  show("music.youtube.com", `HTTP ${res.status}`);
} catch (error) {
  fail("Cannot reach music.youtube.com — network, proxy or firewall.", error);
  process.exit(1);
}

console.log("\n[3] Building the InnerTube session\n");
console.log("    (this fetches YouTube's player script and extracts the signature");
console.log("     functions from it — the step most likely to break)\n");
const { Innertube, UniversalCache } = await import("youtubei.js");
let yt;
try {
  yt = await Innertube.create({
    cache: new UniversalCache(true, process.env.YOUTUBE_CACHE_DIR || "./.yt-session"),
    generate_session_locally: true,
    retrieve_player: true,
  });
  show("session", "created");
  show("player", yt.session?.player ? "loaded" : "MISSING — deciphering will fail");
} catch (error) {
  fail("Innertube.create() failed. A 403 here usually means YouTube refused the player fetch; `npm update youtubei.js` is the fix that normally lands it.", error);
  process.exit(1);
}

console.log("\n[4] A raw music search, before any of our own parsing\n");
try {
  const raw = await yt.music.search("kesariya", { type: "song" });
  show("response type", raw?.constructor?.name);
  show("top-level contents", Array.isArray(raw?.contents) ? `${raw.contents.length} shelf/shelves` : "none");
  show("has .songs shelf", raw?.songs ? `yes (${raw.songs.contents?.length ?? 0} items)` : "no");
  const shelves = raw?.contents ?? [];
  shelves.forEach((s, i) => show(`  shelf ${i}`, `${s?.constructor?.name}, ${s?.contents?.length ?? 0} items`));
  const first = shelves.flatMap((s) => s?.contents ?? []).find((x) => x?.id);
  if (first) {
    show("first item id", first.id);
    show("first item title", JSON.stringify(first.title));
    show("first item artists", JSON.stringify(first.artists?.map((a) => a?.name)));
    show("first item duration", JSON.stringify(first.duration));
    show("thumbnail shape", JSON.stringify(Object.keys(first.thumbnail ?? {})));
  } else {
    console.log("\n  ! Shelves came back but nothing in them had an `id`.");
    console.log("    That is a parsing mismatch, not a network problem — paste this output.");
  }
} catch (error) {
  fail("yt.music.search() failed.", error);
}

console.log("\n[5] Our own layer\n");
try {
  const { searchVideos, fetchTrending, searchAlbums } = await import("./src/services/youtube.js");
  const songs = await searchVideos({ query: "kesariya", limit: 5 });
  show("searchVideos", `${songs.length} track(s)`);
  if (songs[0]) show("  first", `"${songs[0].title}" — ${songs[0].artist}`);
  const albums = await searchAlbums({ query: "brahmastra", limit: 5 });
  show("searchAlbums", `${albums.length} album(s)`);
  const top = await fetchTrending({ limit: 5 });
  show("fetchTrending", `${top.length} track(s)`);
  if (!top.length) console.log("\n  ! fetchTrending is what /music/tracks calls. Empty here = empty there.");
} catch (error) {
  fail("Our services/youtube.js layer threw.", error);
}

console.log("");
