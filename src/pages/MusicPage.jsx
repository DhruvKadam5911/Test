import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipBack, SkipForward, Search, X, Music } from "lucide-react";
import { colors, bodyFont, displayFont } from "../theme";
import AppNavbar from "../components/AppNavbar";
import api from "../api/client";

/*
 * The music player.
 *
 * Playback is YouTube's embedded player, which is the licensed way to play this
 * catalogue: YouTube serves the ads and the rights holders get paid. Nothing
 * here touches an audio file, and the player stays visible — hiding it to make
 * an audio-only app is against the terms it is allowed under.
 */

const IFRAME_API = "https://www.youtube.com/iframe_api";
const SEARCH_DEBOUNCE_MS = 500;

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Loads the IFrame API once, however many components ask for it. */
let apiPromise = null;
function loadYoutubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = IFRAME_API;
    document.head.appendChild(script);
  });
  return apiPromise;
}

export default function MusicPage() {
  const [tracks, setTracks] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef(null);
  const mountRef = useRef(null);

  const track = tracks?.[current] || null;

  useEffect(() => {
    api
      .get("/music/tracks?limit=50")
      .then(setTracks)
      .catch((err) => {
        console.error("fetchTracks error:", err);
        setError(err.message);
        setTracks([]);
      });
  }, []);

  // Debounced, and only once there is something worth asking about — a search
  // costs a hundredth of the day's YouTube quota.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await api.get(`/music/search?q=${encodeURIComponent(q)}`);
        if (!cancelled) {
          setTracks(data);
          setCurrent(0);
          setError(data.length ? null : `Nothing found for "${q}".`);
        }
      } catch (err) {
        console.error("music search error:", err);
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // One player for the life of the page; the track changes inside it.
  useEffect(() => {
    let destroyed = false;

    loadYoutubeApi().then((YT) => {
      if (destroyed || !mountRef.current || playerRef.current) return;

      playerRef.current = new YT.Player(mountRef.current, {
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e) => {
            setPlaying(e.data === YT.PlayerState.PLAYING);
            // Advance the list when a track finishes, the way a player should.
            if (e.data === YT.PlayerState.ENDED) {
              setCurrent((i) => (tracks && i + 1 < tracks.length ? i + 1 : i));
            }
          },
          onError: () => setError("That track would not play here — the owner may have blocked embedding."),
        },
      });
    });

    return () => {
      destroyed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load whichever track is selected.
  useEffect(() => {
    const player = playerRef.current;
    if (!player?.loadVideoById || !track?.sourceId) return;
    player.loadVideoById(track.sourceId);
  }, [track?.sourceId]);

  // The player has no progress event, so it has to be asked.
  useEffect(() => {
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player?.getCurrentTime) return;
      setPosition(player.getCurrentTime() || 0);
      setDuration(player.getDuration() || 0);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const toggle = () => {
    const player = playerRef.current;
    if (!player?.playVideo) return;
    if (playing) player.pauseVideo();
    else player.playVideo();
  };

  const skip = (delta) => {
    if (!tracks?.length) return;
    setCurrent((i) => Math.min(tracks.length - 1, Math.max(0, i + delta)));
  };

  const seek = (event) => {
    const player = playerRef.current;
    if (!player?.seekTo || !duration) return;
    const box = event.currentTarget.getBoundingClientRect();
    player.seekTo(((event.clientX - box.left) / box.width) * duration, true);
  };

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont }} className="w-full overflow-x-hidden">
      <AppNavbar />

      <div className="px-6 md:px-10 pt-8 pb-20 max-w-5xl mx-auto">
        <h1 style={{ fontFamily: displayFont, fontSize: "clamp(30px, 5vw, 44px)", fontWeight: 600, color: colors.text, letterSpacing: "-0.02em" }}>
          Music
        </h1>

        <div
          className="mt-6 flex items-center gap-2 px-3 py-2.5 rounded"
          style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${colors.ring}`, maxWidth: 460 }}
        >
          <Search size={16} color={colors.textMuted} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Backspace" && !query && e.preventDefault()}
            placeholder="Songs, artists, albums…"
            className="outline-none bg-transparent flex-1"
            style={{ color: colors.text, fontSize: 14 }}
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search" style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
              <X size={15} color={colors.textMuted} />
            </button>
          )}
        </div>

        {/* The player itself. Kept visible — hiding it is not allowed. */}
        <div className="mt-7 rounded overflow-hidden" style={{ background: colors.bgElevated, border: `1px solid ${colors.ring}` }}>
          <div className="w-full" style={{ aspectRatio: "16 / 9", background: "#000" }}>
            <div ref={mountRef} className="w-full h-full" />
          </div>

          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.text }} className="truncate">
              {track?.title || "Nothing selected"}
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} className="truncate">
              {track?.artist || ""}
            </div>

            <div
              onClick={seek}
              className="mt-4"
              style={{ height: 5, background: "rgba(255,255,255,0.10)", borderRadius: 3, cursor: "pointer" }}
            >
              <div style={{ height: "100%", width: duration ? `${(position / duration) * 100}%` : 0, background: colors.accent, borderRadius: 3 }} />
            </div>

            <div className="flex items-center justify-between mt-2" style={{ fontSize: 11, color: colors.textMuted }}>
              <span>{formatTime(position)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            <div className="flex items-center gap-4 mt-4">
              <button onClick={() => skip(-1)} aria-label="Previous track" style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                <SkipBack size={20} color={colors.textMuted} />
              </button>
              <button
                onClick={toggle}
                aria-label={playing ? "Pause" : "Play"}
                style={{ background: colors.accent, border: "none", borderRadius: "50%", width: 46, height: 46, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {playing ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}
              </button>
              <button onClick={() => skip(1)} aria-label="Next track" style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                <SkipForward size={20} color={colors.textMuted} />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4" style={{ fontSize: 12.5, color: colors.textMuted }}>
          {searching ? "Searching…" : query.trim().length >= 2 ? `Results for "${query.trim()}"` : "Trending in India"}
        </div>

        {tracks === null ? (
          <div className="mt-4 space-y-3 animate-pulse">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ height: 54, background: colors.bgElevated, borderRadius: 6 }} />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="mt-8 flex flex-col items-start" style={{ color: colors.textMuted, fontSize: 14, lineHeight: 1.7, maxWidth: 560 }}>
            <Music size={26} color={colors.textMuted} />
            <p className="mt-3">{error || "No music yet. Search for a song or an artist."}</p>
          </div>
        ) : (
          <div className="mt-3">
            {tracks.map((t, i) => (
              <button
                key={t.sourceId || t.id}
                onClick={() => setCurrent(i)}
                className="w-full flex items-center gap-3 text-left"
                style={{ background: i === current ? "rgba(255,255,255,0.05)" : "none", border: "none", borderBottom: `1px solid ${colors.ring}`, padding: "10px 10px", cursor: "pointer" }}
              >
                {t.artworkUrl ? (
                  <img src={t.artworkUrl} alt="" width={56} height={32} style={{ objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 56, height: 32, background: colors.bgElevated, borderRadius: 3, flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 13.5, fontWeight: 600, color: colors.text, flex: 1, minWidth: 0 }} className="truncate">{t.title}</span>
                <span style={{ fontSize: 12, color: colors.textMuted, maxWidth: "30%" }} className="truncate hidden sm:block">{t.artist}</span>
                {t.durationSeconds ? (
                  <span style={{ fontSize: 11, color: colors.textMuted, marginLeft: 10 }}>{formatTime(t.durationSeconds)}</span>
                ) : null}
              </button>
            ))}
          </div>
        )}

        {error && tracks?.length > 0 && (
          <div className="mt-5" style={{ fontSize: 13, color: colors.textMuted }}>{error}</div>
        )}
      </div>
    </div>
  );
}
