/**
 * Lyrics service using LRCLIB (open-source lyrics API used by Harmony-Music & NewPipe)
 */

const LRCLIB_BASE = "https://lrclib.net/api";

function cleanTitle(title) {
  if (!title) return "";
  return title
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/feat\..*$/i, "")
    .replace(/ft\..*$/i, "")
    .replace(/official\s+video/gi, "")
    .replace(/official\s+audio/gi, "")
    .replace(/lyric\s+video/gi, "")
    .replace(/audio/gi, "")
    .replace(/video/gi, "")
    .trim();
}

function parseLrc(lrcString) {
  if (!lrcString) return [];
  const lines = lrcString.split("\n");
  const result = [];

  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millis = parseInt(match[3].padEnd(3, "0"), 10);
      const totalSeconds = minutes * 60 + seconds + millis / 1000;
      const text = line.replace(timeRegex, "").trim();

      if (text.length > 0) {
        result.push({
          time: Math.round(totalSeconds * 100) / 100,
          text,
        });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

export async function fetchLyrics({ track, artist, duration } = {}) {
  const cleanedTrack = cleanTitle(track);
  if (!cleanedTrack) return { synced: [], plain: "", hasSynced: false };

  try {
    // 1. Direct get
    const url = new URL(`${LRCLIB_BASE}/get`);
    url.searchParams.set("track_name", cleanedTrack);
    if (artist) url.searchParams.set("artist_name", artist);
    if (duration && Number(duration) > 0) {
      url.searchParams.set("duration", String(Math.round(Number(duration))));
    }

    let res = await fetch(url.toString(), {
      headers: { "User-Agent": "OnionTV/1.0 (https://github.com/sudospade/Oniontv)" },
    });

    // 2. If direct get 404s, fallback to search
    if (!res.ok) {
      const searchUrl = new URL(`${LRCLIB_BASE}/search`);
      searchUrl.searchParams.set("q", `${cleanedTrack} ${artist || ""}`.trim());
      res = await fetch(searchUrl.toString(), {
        headers: { "User-Agent": "OnionTV/1.0 (https://github.com/sudospade/Oniontv)" },
      });

      if (!res.ok) {
        return { synced: [], plain: "", hasSynced: false };
      }

      const list = await res.json();
      if (!Array.isArray(list) || !list.length) {
        return { synced: [], plain: "", hasSynced: false };
      }

      // Pick the best match with synced lyrics
      const match = list.find((item) => item.syncedLyrics) || list[0];
      const parsedSynced = parseLrc(match.syncedLyrics);
      return {
        synced: parsedSynced,
        plain: match.plainLyrics || "",
        hasSynced: parsedSynced.length > 0,
        trackName: match.trackName,
        artistName: match.artistName,
      };
    }

    const data = await res.json();
    const parsedSynced = parseLrc(data.syncedLyrics);

    return {
      synced: parsedSynced,
      plain: data.plainLyrics || "",
      hasSynced: parsedSynced.length > 0,
      trackName: data.trackName,
      artistName: data.artistName,
    };
  } catch (err) {
    console.warn("fetchLyrics error:", err.message);
    return { synced: [], plain: "", hasSynced: false };
  }
}
