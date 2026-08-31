import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Search, X, Music,
  Shuffle, Repeat, Volume2, VolumeX, Disc3, ListMusic,
} from "lucide-react";
import { colors, bodyFont, displayFont } from "../theme";
import AppNavbar from "../components/AppNavbar";
import api from "../api/client";

/*
 * The music player.
 *
 * Playback is YouTube's embedded player, which is the licensed way to play this
 * catalogue: YouTube serves the ads and the rights holders get paid. Nothing
 * here touches an audio file.
 *
 * The video is never hidden — YouTube's terms forbid obscuring any part of the
 * player, and an app that does it loses its key — but it does not have to be
 * the thing you look at. Browsing, the artwork fills the page and the video
 * sits beside it. Searching, the whole player shrinks into a corner so the
 * results have the room, and keeps playing.
 *
 * That last part is why the player is `position: fixed` and moved by animating
 * its box rather than by being re-rendered somewhere else in the tree: moving
 * an iframe in the DOM reloads it, and reloading it stops the music.
 */

const IFRAME_API = "https://www.youtube.com/iframe_api";
const SEARCH_DEBOUNCE_MS = 500;
const DOCK_MARGIN = 16;
const DOCK_WIDTH = 300;

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
  const [albums, setAlbums] = useState(null);
  const [tab, setTab] = useState("songs");
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // What is loaded in the player, kept apart from what the list is showing.
  // Searching changes the list; it should not reach into the player and stop
  // the song someone is listening to.
  const [nowPlaying, setNowPlaying] = useState(null);
  const [autoplay, setAutoplay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  const playerRef = useRef(null);
  const hostRef = useRef(null);
  const slotRef = useRef(null);
  const tracksRef = useRef(null);
  const [box, setBox] = useState(null);

  const searchActive = query.trim().length >= 2;
  const docked = searchActive;
  const track = nowPlaying;
  const current = tracks?.findIndex((t) => t.sourceId === nowPlaying?.sourceId) ?? -1;

  // The state-change handler is registered once, so it reads the list through a
  // ref rather than closing over whatever it was at mount.
  tracksRef.current = tracks;

  useEffect(() => {
    api
      .get("/music/tracks?limit=50")
      .then((data) => {
        setTracks(data);
        // Cued, not played: nothing should start on its own.
        if (data.length) setNowPlaying(data[0]);
      })
      .catch((err) => {
        console.error("fetchTracks error:", err);
        setError(err.message);
        setTracks([]);
      });
  }, []);

  // Debounced: a search costs a hundredth of the day's YouTube quota.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const path = tab === "albums" ? "/music/albums" : "/music/search";
        const data = await api.get(`${path}?q=${encodeURIComponent(q)}`);
        if (cancelled) return;
        if (tab === "albums") setAlbums(data);
        else setTracks(data);
        setError(data.length ? null : `Nothing found for "${q}".`);
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
  }, [query, tab]);

  // One player for the life of the page.
  useEffect(() => {
    let destroyed = false;

    loadYoutubeApi().then((YT) => {
      if (destroyed || !hostRef.current || playerRef.current) return;

      playerRef.current = new YT.Player(hostRef.current, {
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e) => {
            setPlaying(e.data === YT.PlayerState.PLAYING);
            if (e.data === YT.PlayerState.ENDED) {
              const list = tracksRef.current;
              if (!list?.length) return;
              setAutoplay(true);
              setNowPlaying((playingNow) => {
                if (repeat) return playingNow;
                if (shuffle) return list[Math.floor(Math.random() * list.length)];
                const i = list.findIndex((t) => t.sourceId === playingNow?.sourceId);
                return i >= 0 && i + 1 < list.length ? list[i + 1] : playingNow;
              });
            }
          },
          onError: () => setError("That one would not play here — the owner may have blocked embedding."),
        },
      });
    });

    return () => {
      destroyed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeat, shuffle]);

  // Cue rather than load unless a person asked for this one: cueing readies the
  // track without playing it, so opening the page is silent and a search does
  // not start something nobody clicked.
  useEffect(() => {
    const player = playerRef.current;
    if (!player?.cueVideoById || !track?.sourceId) return;

    if (track.source === "youtube-playlist") {
      player.loadPlaylist({ list: track.sourceId, listType: "playlist" });
      return;
    }
    if (autoplay) player.loadVideoById(track.sourceId);
    else player.cueVideoById(track.sourceId);
  }, [track?.sourceId, track?.source, autoplay]);

  // The player has no progress event, so it has to be asked.
  useEffect(() => {
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player?.getCurrentTime) return;
      setPosition(player.getCurrentTime() || 0);
      setDuration(player.getDuration() || 0);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  /*
   * Where the player should be right now. Docked it goes bottom-right; otherwise
   * it takes the shape of the slot the layout has left for it.
   */
  const measure = useCallback(() => {
    if (docked) {
      const width = Math.min(DOCK_WIDTH, window.innerWidth - DOCK_MARGIN * 2);
      const height = Math.round((width * 9) / 16);
      setBox({
        top: window.innerHeight - height - DOCK_MARGIN,
        left: window.innerWidth - width - DOCK_MARGIN,
        width,
        height,
      });
      return;
    }

    const slot = slotRef.current;
    if (!slot) return;
    const r = slot.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [docked]);

  useEffect(() => {
    measure();
    let frame = 0;
    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [measure, tracks, tab]);

  const toggle = () => {
    const player = playerRef.current;
    if (!player?.playVideo) return;
    if (playing) player.pauseVideo();
    else player.playVideo();
  };

  const skip = (delta) => {
    if (!tracks?.length) return;
    setAutoplay(true);
    if (shuffle && delta > 0) {
      setNowPlaying(tracks[Math.floor(Math.random() * tracks.length)]);
      return;
    }
    const next = Math.min(tracks.length - 1, Math.max(0, current + delta));
    setNowPlaying(tracks[next]);
  };

  const seek = (event) => {
    const player = playerRef.current;
    if (!player?.seekTo || !duration) return;
    const r = event.currentTarget.getBoundingClientRect();
    player.seekTo(((event.clientX - r.left) / r.width) * duration, true);
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player?.mute) return;
    if (muted) player.unMute();
    else player.mute();
    setMuted((m) => !m);
  };

  const progress = duration ? (position / duration) * 100 : 0;
  const list = tab === "albums" ? albums : tracks;

  const iconButton = (active) => ({
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    color: active ? colors.accentLight : colors.textMuted,
  });

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont }} className="w-full overflow-x-hidden">
      <AppNavbar />

      {/* The now playing surface. Its own artwork, blurred, is the backdrop —
          the page takes on the colour of whatever is on. */}
      <div className="relative">
        {track?.artworkUrl && !docked && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${track.artworkUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(64px) saturate(1.4)",
              opacity: 0.5,
              transform: "scale(1.2)",
            }}
          />
        )}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(to bottom, rgba(12,8,18,0.55), ${colors.bg} 92%)` }}
        />

        <div className="relative px-6 md:px-10 pt-8 pb-10 max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Disc3 size={22} color={colors.accentLight} style={{ animation: playing ? "onion-spin 3.2s linear infinite" : "none" }} />
            <h1 style={{ fontFamily: displayFont, fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 600, color: colors.text, letterSpacing: "-0.02em" }}>
              Music
            </h1>
          </div>
          <style>{`@keyframes onion-spin { to { transform: rotate(360deg); } }`}</style>

          <div
            className="mt-5 flex items-center gap-2 px-3 py-2.5 rounded"
            style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${colors.ring}`, maxWidth: 460 }}
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

          {/* Browsing: artwork large, video beside it. Searching: this whole
              block collapses and the player is in the corner instead. */}
          {!docked && (
            <div className="mt-8 flex flex-col md:flex-row gap-6 items-start">
              <div
                className="w-full md:w-[320px] flex-shrink-0 rounded-lg"
                style={{
                  aspectRatio: "1 / 1",
                  background: track?.artworkUrl ? `url(${track.artworkUrl}) center/cover no-repeat` : colors.bgElevated,
                  boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
                }}
              />

              <div className="flex-1 w-full min-w-0">
                {/* The slot the player is flown into. Empty by design. */}
                <div ref={slotRef} className="w-full rounded-lg" style={{ aspectRatio: "16 / 9", background: "#000" }} />

                <div className="mt-5 min-w-0">
                  <div style={{ fontSize: 19, fontWeight: 700, color: colors.text }} className="truncate">
                    {track?.title || "Nothing playing"}
                  </div>
                  <div style={{ fontSize: 13.5, color: colors.textMuted, marginTop: 3 }} className="truncate">
                    {track?.artist || "Pick something below"}
                  </div>
                </div>

                <div onClick={seek} className="mt-5" style={{ height: 6, background: "rgba(255,255,255,0.12)", borderRadius: 3, cursor: "pointer" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: colors.accent, borderRadius: 3, transition: "width 400ms linear" }} />
                </div>
                <div className="flex items-center justify-between mt-2" style={{ fontSize: 11, color: colors.textMuted }}>
                  <span>{formatTime(position)}</span>
                  <span>{formatTime(duration)}</span>
                </div>

                <div className="flex items-center gap-5 mt-5">
                  <button onClick={() => setShuffle((v) => !v)} aria-label="Shuffle" style={iconButton(shuffle)}>
                    <Shuffle size={17} />
                  </button>
                  <button onClick={() => skip(-1)} aria-label="Previous" style={iconButton(false)}>
                    <SkipBack size={20} />
                  </button>
                  <button
                    onClick={toggle}
                    aria-label={playing ? "Pause" : "Play"}
                    style={{ background: colors.accent, border: "none", borderRadius: "50%", width: 52, height: 52, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 22px rgba(123,38,133,0.5)" }}
                  >
                    {playing ? <Pause size={22} color="#fff" /> : <Play size={22} color="#fff" style={{ marginLeft: 2 }} />}
                  </button>
                  <button onClick={() => skip(1)} aria-label="Next" style={iconButton(false)}>
                    <SkipForward size={20} />
                  </button>
                  <button onClick={() => setRepeat((v) => !v)} aria-label="Repeat" style={iconButton(repeat)}>
                    <Repeat size={17} />
                  </button>
                  <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} style={{ ...iconButton(false), marginLeft: "auto" }}>
                    {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 md:px-10 pb-28 max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          {["songs", "albums"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontFamily: bodyFont, fontSize: 13, fontWeight: 600, textTransform: "capitalize",
                color: tab === t ? colors.text : colors.textMuted,
                background: tab === t ? "rgba(255,255,255,0.10)" : "transparent",
                border: `1px solid ${tab === t ? colors.ring : "transparent"}`,
                borderRadius: 999, padding: "6px 15px", cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
          <span style={{ fontSize: 12.5, color: colors.textMuted, marginLeft: 8 }}>
            {searching ? "Searching…" : searchActive ? `for "${query.trim()}"` : "Trending in India"}
          </span>
        </div>

        {list === null ? (
          <div className="mt-5 space-y-3 animate-pulse">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: 56, background: colors.bgElevated, borderRadius: 8 }} />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="mt-8 flex flex-col items-start" style={{ color: colors.textMuted, fontSize: 14, lineHeight: 1.7, maxWidth: 560 }}>
            {tab === "albums" ? <ListMusic size={26} color={colors.textMuted} /> : <Music size={26} color={colors.textMuted} />}
            <p className="mt-3">{error || (searchActive ? "Nothing here." : "Search for a song, an artist or an album.")}</p>
          </div>
        ) : (
          <div className="mt-4">
            {list.map((t, i) => {
              const active = tab === "songs" && i === current;
              return (
                <button
                  key={t.sourceId || t.id}
                  onClick={() => {
                    setAutoplay(true);
                    if (tab === "albums") {
                      setTracks([t]);
                      setTab("songs");
                      setQuery("");
                    }
                    setNowPlaying(t);
                  }}
                  className="w-full flex items-center gap-3 text-left rounded"
                  style={{
                    background: active ? "rgba(255,255,255,0.07)" : "none",
                    border: "none", borderBottom: `1px solid ${colors.ring}`,
                    padding: "10px 12px", cursor: "pointer",
                  }}
                >
                  <span style={{ width: 18, fontSize: 11.5, color: active ? colors.accentLight : colors.textMuted, flexShrink: 0 }}>
                    {active && playing ? "▶" : i + 1}
                  </span>
                  {t.artworkUrl ? (
                    <img src={t.artworkUrl} alt="" width={60} height={34} style={{ objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 60, height: 34, background: colors.bgElevated, borderRadius: 4, flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: active ? colors.accentLight : colors.text, flex: 1, minWidth: 0 }} className="truncate">
                    {t.title}
                  </span>
                  <span style={{ fontSize: 12, color: colors.textMuted, maxWidth: "28%" }} className="truncate hidden sm:block">
                    {t.artist}
                  </span>
                  {t.durationSeconds ? (
                    <span style={{ fontSize: 11, color: colors.textMuted, marginLeft: 10, flexShrink: 0 }}>{formatTime(t.durationSeconds)}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/*
        The player. One element, always mounted, moved by animating its box —
        re-rendering it into a different parent would reload the iframe and stop
        the music. Visible in both positions, which is the condition it plays
        under.
      */}
      <div
        style={{
          position: "fixed",
          top: box?.top ?? -9999,
          left: box?.left ?? -9999,
          width: box?.width ?? 320,
          height: box?.height ?? 180,
          zIndex: docked ? 60 : 5,
          borderRadius: docked ? 10 : 8,
          overflow: "hidden",
          background: "#000",
          boxShadow: docked ? "0 18px 44px rgba(0,0,0,0.7)" : "none",
          border: docked ? `1px solid ${colors.ring}` : "none",
          transition: "top 460ms cubic-bezier(.25,.46,.45,.94), left 460ms cubic-bezier(.25,.46,.45,.94), width 460ms cubic-bezier(.25,.46,.45,.94), height 460ms cubic-bezier(.25,.46,.45,.94), border-radius 300ms ease",
        }}
      >
        <div ref={hostRef} className="w-full h-full" />
      </div>

      {/* The docked player's own controls, so a search does not mean reaching
          back up the page to pause. */}
      {docked && box && (
        <div
          className="flex items-center gap-3"
          style={{
            position: "fixed",
            left: box.left,
            top: box.top - 52,
            width: box.width,
            zIndex: 60,
            background: colors.bgElevated,
            border: `1px solid ${colors.ring}`,
            borderRadius: 10,
            padding: "8px 10px",
            boxShadow: "0 12px 30px rgba(0,0,0,0.6)",
          }}
        >
          <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} style={{ background: colors.accent, border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {playing ? <Pause size={14} color="#fff" /> : <Play size={14} color="#fff" style={{ marginLeft: 1 }} />}
          </button>
          <div className="min-w-0 flex-1">
            <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.text }} className="truncate">{track?.title || "Nothing playing"}</div>
            <div style={{ height: 3, background: "rgba(255,255,255,0.12)", borderRadius: 2, marginTop: 4 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: colors.accent, borderRadius: 2 }} />
            </div>
          </div>
          <button onClick={() => skip(1)} aria-label="Next" style={iconButton(false)}>
            <SkipForward size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
