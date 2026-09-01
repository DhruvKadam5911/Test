import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Play, Pause, SkipBack, SkipForward, Search, X, Music, Home, Compass,
  Library, Shuffle, Repeat, Volume2, VolumeX, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown, ListMusic,
} from "lucide-react";
import { colors, bodyFont, displayFont } from "../theme";
import OnionLogo from "../components/shared/OnionLogo";
import api from "../api/client";

/*
 * Music.
 *
 * Laid out the way a music app is: a rail down the left, a search bar across
 * the top, rows of cards, and a bar along the bottom that stays put while you
 * browse. Opening the bar gives the full now-playing view.
 *
 * Playback is YouTube's embedded player — the licensed way to play this
 * catalogue, since YouTube serves the ads and the rights holders get paid.
 *
 * The Song/Video switch changes what the eye goes to, not whether the video
 * exists: in Song it is small beside the artwork, in Video it fills the stage.
 * YouTube's terms forbid obscuring any part of the player and set a floor on
 * its size, and an app that breaks either loses its key — so it is never
 * covered and never smaller than the floor.
 *
 * The player is `position: fixed` and moved by animating its box rather than
 * re-rendered somewhere else in the tree: moving an iframe in the DOM reloads
 * it, and reloading it stops the music.
 */

const IFRAME_API = "https://www.youtube.com/iframe_api";
const SEARCH_DEBOUNCE_MS = 500;

// YouTube's terms set a floor of 200×200 on the embedded player, so the docked
// size is the smallest 16:9 box that clears it rather than the smallest that
// looks tidy.
const DOCK_WIDTH = 356;
const DOCK_HEIGHT = 200;
const DOCK_MARGIN = 14;

const RAIL_WIDTH = 232;
const BAR_HEIGHT = 76;

// A phone gets the rail as a bottom bar instead, the way music apps do it.
const NAV_HEIGHT = 58;
const NARROW = "(max-width: 767px)";

const MOODS = [
  "Podcasts", "Work out", "Energise", "Romance", "Feel good",
  "Sleep", "Commute", "Relax", "Party", "Sad", "Focus",
];

const RECENT_KEY = "onion.music.recent";

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function readRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function rememberRecent(track) {
  try {
    const kept = readRecent().filter((t) => t.sourceId !== track.sourceId);
    localStorage.setItem(RECENT_KEY, JSON.stringify([track, ...kept].slice(0, 12)));
  } catch {
    // A browser that refuses storage still plays music; this is a convenience.
  }
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
  const [view, setView] = useState("home");
  const [tracks, setTracks] = useState(null);
  const [albums, setAlbums] = useState(null);
  const [recent, setRecent] = useState(() => readRecent());
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState("songs");

  const [nowPlaying, setNowPlaying] = useState(null);
  const [autoplay, setAutoplay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [liked, setLiked] = useState(null);

  const [expanded, setExpanded] = useState(false);
  const [stage, setStage] = useState("song");
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(NARROW).matches
  );
  const [mobileSearch, setMobileSearch] = useState(false);

  useEffect(() => {
    const q = window.matchMedia?.(NARROW);
    if (!q) return;
    const onChange = (e) => setNarrow(e.matches);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);

  const playerRef = useRef(null);
  const hostRef = useRef(null);
  const slotRef = useRef(null);
  const tracksRef = useRef(null);
  const [box, setBox] = useState(null);

  const searchActive = query.trim().length >= 2;
  const track = nowPlaying;
  tracksRef.current = tracks;

  useEffect(() => {
    api
      .get("/music/tracks?limit=50")
      .then((data) => {
        setTracks(data);
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
        const path = searchMode === "albums" ? "/music/albums" : "/music/search";
        const data = await api.get(`${path}?q=${encodeURIComponent(q)}`);
        if (cancelled) return;
        if (searchMode === "albums") setAlbums(data);
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
  }, [query, searchMode]);

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

  // Cue rather than load unless a person asked for this one, so opening the page
  // is silent and a search does not start something nobody clicked.
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

  useEffect(() => {
    if (!track || !autoplay) return;
    rememberRecent(track);
    setRecent(readRecent());
    setLiked(null);
  }, [track?.sourceId, autoplay, track]);

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

  /** Where the player sits: its slot on the stage, or the corner. */
  const measure = useCallback(() => {
    const slot = slotRef.current;
    if (expanded && slot) {
      const r = slot.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
      return;
    }

    const width = Math.min(DOCK_WIDTH, window.innerWidth - DOCK_MARGIN * 2);
    const height = Math.max(DOCK_HEIGHT, Math.round((width * 9) / 16));
    setBox({
      top: window.innerHeight - height - BAR_HEIGHT - (narrow ? NAV_HEIGHT : 0) - DOCK_MARGIN,
      left: window.innerWidth - width - DOCK_MARGIN,
      width,
      height,
    });
  }, [expanded, narrow]);

  useEffect(() => {
    // Two reads: now, and once the layout has settled. The slot no longer moves
    // while anything scrolls — only the queue does — so there is nothing to
    // chase frame by frame, and chasing it was itself the visible drift.
    measure();
    const settle = requestAnimationFrame(measure);

    let frame = 0;
    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    // Still in the capture phase: the browsing view scrolls under a docked
    // player, and a listener on `window` misses a scroll inside a container.
    document.addEventListener("scroll", onChange, { passive: true, capture: true });
    window.addEventListener("resize", onChange);

    // The slot also changes size without anything scrolling — the Song/Video
    // switch, a rotation, the rail appearing at a wider window.
    const observer = new ResizeObserver(onChange);
    if (slotRef.current) observer.observe(slotRef.current);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settle);
      document.removeEventListener("scroll", onChange, { capture: true });
      window.removeEventListener("resize", onChange);
      observer.disconnect();
    };
  }, [measure, stage, tracks, view, expanded]);

  const play = (t) => {
    setAutoplay(true);
    setNowPlaying(t);
  };

  const toggle = () => {
    const player = playerRef.current;
    if (!player?.playVideo) return;
    if (playing) player.pauseVideo();
    else player.playVideo();
  };

  const skip = (delta) => {
    const list = tracks;
    if (!list?.length) return;
    setAutoplay(true);
    if (shuffle && delta > 0) {
      setNowPlaying(list[Math.floor(Math.random() * list.length)]);
      return;
    }
    const i = list.findIndex((t) => t.sourceId === nowPlaying?.sourceId);
    setNowPlaying(list[Math.min(list.length - 1, Math.max(0, i + delta))]);
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
  const list = searchActive && searchMode === "albums" ? albums : tracks;

  const railItem = (key, label, Icon) => (
    <button
      key={key}
      onClick={() => { setView(key); setQuery(""); }}
      className="flex items-center gap-4 w-full rounded"
      style={{
        background: view === key ? "rgba(255,255,255,0.10)" : "transparent",
        border: "none", cursor: "pointer", padding: "11px 14px",
        color: view === key ? colors.text : colors.textMuted,
        fontFamily: bodyFont, fontSize: 14, fontWeight: view === key ? 700 : 500,
      }}
    >
      <Icon size={20} />
      {label}
    </button>
  );

  const cardRow = (title, items) =>
    items.length > 0 && (
      <div className="mb-10">
        <div style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 600, color: colors.text, marginBottom: 14 }}>
          {title}
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {items.map((t) => (
            <button
              key={t.sourceId}
              onClick={() => play(t)}
              className="flex-shrink-0 text-left"
              style={{ width: 168, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <div
                className="relative rounded"
                style={{
                  width: 168, height: 168,
                  background: t.artworkUrl ? `url(${t.artworkUrl}) center/cover no-repeat` : colors.bgElevated,
                }}
              >
                <span
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.28)", opacity: 0, transition: "opacity 200ms ease" }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = 0)}
                >
                  <Play size={30} color="#fff" fill="#fff" />
                </span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.text, marginTop: 9 }} className="line-clamp-2">
                {t.title}
              </div>
              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 3 }} className="truncate">
                {t.artist}
              </div>
            </button>
          ))}
        </div>
      </div>
    );

  const trackRow = (t, i) => {
    const active = t.sourceId === nowPlaying?.sourceId;
    return (
      <button
        key={t.sourceId || t.id}
        onClick={() => play(t)}
        className="w-full flex items-center gap-3 text-left rounded"
        style={{
          background: active ? "rgba(255,255,255,0.07)" : "none",
          border: "none", padding: "8px 10px", cursor: "pointer",
        }}
      >
        <span style={{ width: 18, fontSize: 11.5, color: active ? colors.accentLight : colors.textMuted, flexShrink: 0 }}>
          {active && playing ? "▶" : i + 1}
        </span>
        {t.artworkUrl ? (
          <img src={t.artworkUrl} alt="" width={48} height={48} style={{ objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
        ) : (
          <span style={{ width: 48, height: 48, background: colors.bgElevated, borderRadius: 3, flexShrink: 0 }} />
        )}
        <span className="min-w-0 flex-1">
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: active ? colors.accentLight : colors.text }} className="truncate">
            {t.title}
          </span>
          <span style={{ display: "block", fontSize: 12, color: colors.textMuted, marginTop: 2 }} className="truncate">
            {t.artist}
          </span>
        </span>
        {t.durationSeconds ? (
          <span style={{ fontSize: 11.5, color: colors.textMuted, flexShrink: 0 }}>{formatTime(t.durationSeconds)}</span>
        ) : null}
      </button>
    );
  };

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont, color: colors.text }}>
      {/* Rail */}
      <div
        className="hidden md:flex flex-col gap-1 fixed left-0 top-0 bottom-0 px-3 pt-4"
        style={{ width: RAIL_WIDTH, borderRight: `1px solid ${colors.ring}`, zIndex: 30, background: colors.bg }}
      >
        <Link to="/" style={{ textDecoration: "none", marginBottom: 8, paddingLeft: 6 }}>
          <OnionLogo height={62} />
        </Link>
        {railItem("home", "Home", Home)}
        {railItem("explore", "Explore", Compass)}
        {railItem("library", "Library", Library)}
        <div style={{ borderTop: `1px solid ${colors.ring}`, margin: "14px 8px" }} />
        <Link to="/" style={{ fontSize: 13, color: colors.textMuted, textDecoration: "none", padding: "8px 14px" }}>
          ← Back to Onion
        </Link>
      </div>

      {/* Written out rather than a Tailwind arbitrary value: the rail's width is
          a constant this file already owns, and the generated class was not
          coming through, which left the content under the rail. */}
      <style>{`
        .music-shell { padding-left: 0; }
        @media (min-width: 768px) { .music-shell { padding-left: ${RAIL_WIDTH}px; } }
      `}</style>
      <div className="music-shell">
        {/* Search. A phone gets the app bar a music app has — mark, then a
            magnifier that opens the field — rather than a search box taking a
            third of the screen before anything has been looked at. */}
        <div
          className="sticky top-0 flex items-center gap-3 px-4 md:px-6 py-3"
          style={{ background: colors.bg, borderBottom: `1px solid ${colors.ring}`, zIndex: 25 }}
        >
          {narrow && !mobileSearch && (
            <>
              <Link to="/" style={{ textDecoration: "none", display: "flex" }}>
                <OnionLogo height={44} />
              </Link>
              <button
                onClick={() => setMobileSearch(true)}
                aria-label="Search"
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", marginLeft: "auto", color: colors.textMuted }}
              >
                <Search size={21} />
              </button>
            </>
          )}

          {(!narrow || mobileSearch) && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded w-full mx-auto"
              style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${colors.ring}`, maxWidth: 620 }}
            >
              <Search size={17} color={colors.textMuted} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Backspace" && !query && e.preventDefault()}
                placeholder="Search songs, albums, artists"
                autoFocus={mobileSearch}
                className="outline-none bg-transparent flex-1"
                style={{ color: colors.text, fontSize: 14.5 }}
              />
              {(query || mobileSearch) && (
                <button
                  onClick={() => { setQuery(""); setMobileSearch(false); }}
                  aria-label="Clear search"
                  style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}
                >
                  <X size={16} color={colors.textMuted} />
                </button>
              )}
            </div>
          )}
        </div>

        <div
          className="px-4 md:px-8 pt-5"
          style={{ paddingBottom: BAR_HEIGHT + DOCK_HEIGHT + (narrow ? NAV_HEIGHT : 0) + 40 }}
        >
          {/* Moods, the way YouTube Music opens */}
          {!searchActive && (
            <div className="flex gap-2.5 overflow-x-auto pb-5" style={{ scrollbarWidth: "none" }}>
              {MOODS.map((mood) => (
                <button
                  key={mood}
                  onClick={() => { setSearchMode("songs"); setQuery(`${mood} songs`); }}
                  className="flex-shrink-0"
                  style={{
                    fontFamily: bodyFont, fontSize: 13, fontWeight: 600, color: colors.text,
                    background: "rgba(255,255,255,0.07)", border: `1px solid ${colors.ring}`,
                    borderRadius: 6, padding: "8px 16px", cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  {mood}
                </button>
              ))}
            </div>
          )}

          {searchActive && (
            <div className="flex items-center gap-2 pb-4">
              {["songs", "albums"].map((m) => (
                <button
                  key={m}
                  onClick={() => setSearchMode(m)}
                  style={{
                    fontFamily: bodyFont, fontSize: 13, fontWeight: 600, textTransform: "capitalize",
                    color: searchMode === m ? colors.bg : colors.text,
                    background: searchMode === m ? colors.text : "rgba(255,255,255,0.07)",
                    border: `1px solid ${colors.ring}`, borderRadius: 999, padding: "6px 16px", cursor: "pointer",
                  }}
                >
                  {m}
                </button>
              ))}
              <span style={{ fontSize: 12.5, color: colors.textMuted, marginLeft: 6 }}>
                {searching ? "Searching…" : `for "${query.trim()}"`}
              </span>
            </div>
          )}

          {view === "library" && !searchActive ? (
            recent.length ? (
              <>
                {cardRow("Listen again", recent)}
                <div style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 600, marginBottom: 10 }}>Recent</div>
                {recent.map(trackRow)}
              </>
            ) : (
              <div style={{ color: colors.textMuted, fontSize: 14, paddingTop: 24 }}>
                <Library size={26} />
                <p className="mt-3">Nothing here yet. Whatever you play shows up in this list.</p>
              </div>
            )
          ) : list === null ? (
            <div className="space-y-3 animate-pulse">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ height: 60, background: colors.bgElevated, borderRadius: 8 }} />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div style={{ color: colors.textMuted, fontSize: 14, paddingTop: 24, maxWidth: 520, lineHeight: 1.7 }}>
              {searchMode === "albums" ? <ListMusic size={26} /> : <Music size={26} />}
              <p className="mt-3">{error || "Search for a song, an artist or an album."}</p>
            </div>
          ) : (
            <>
              {!searchActive && recent.length > 0 && cardRow("Listen again", recent)}
              {!searchActive && cardRow(view === "explore" ? "New releases" : "Trending in India", list.slice(0, 12))}

              <div style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 600, marginBottom: 10 }}>
                {searchActive ? "Results" : "Quick picks"}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                {list.map(trackRow)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* The now-playing stage, opened from the bar. */}
      {expanded && (
        <div
          className="fixed inset-0 flex flex-col"
          style={{ background: colors.bg, zIndex: 55, paddingBottom: narrow ? BAR_HEIGHT + NAV_HEIGHT : BAR_HEIGHT }}
        >
          {track?.artworkUrl && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${track.artworkUrl})`, backgroundSize: "cover", backgroundPosition: "center",
                filter: "blur(80px) saturate(1.5)", opacity: 0.45, transform: "scale(1.25)",
              }}
            />
          )}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(12,8,18,0.62)" }} />

          <div className="relative flex items-center px-4 pt-4 pb-2">
            <button
              onClick={() => setExpanded(false)}
              aria-label="Collapse"
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: colors.text }}
            >
              <ChevronDown size={24} />
            </button>
            <div className="flex rounded-full overflow-hidden mx-auto" style={{ background: "rgba(255,255,255,0.10)", border: `1px solid ${colors.ring}` }}>
              {["song", "video"].map((m) => (
                <button
                  key={m}
                  onClick={() => setStage(m)}
                  style={{
                    fontFamily: bodyFont, fontSize: 13, fontWeight: 600, textTransform: "capitalize",
                    color: stage === m ? colors.bg : colors.text,
                    background: stage === m ? colors.text : "transparent",
                    border: "none", padding: "7px 26px", cursor: "pointer",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <span style={{ width: 24 }} />
          </div>

          {narrow ? (
            /* A phone: one column, the artwork in the middle of it, controls
               large enough for a thumb, and the queue underneath. */
            <div className="relative flex-1 min-h-0 px-5 pb-2 flex flex-col">
              {stage === "song" && (
                <div className="flex justify-center py-2">
                  <div
                    className="rounded-lg"
                    style={{
                      // Small enough that the artwork, the player and the
                      // controls all fit above the bar on a phone. The video
                      // takes 190px that a music app does not have to spend.
                      width: "min(168px, 44vw)", aspectRatio: "1 / 1",
                      background: track?.artworkUrl ? `url(${track.artworkUrl}) center/cover no-repeat` : colors.bgElevated,
                      boxShadow: "0 26px 60px rgba(0,0,0,0.6)",
                    }}
                  />
                </div>
              )}

              {/* Full-bleed, cancelling the column's padding: at 16:9 inside a
                  375px screen's padded width the player comes out 189px tall,
                  under YouTube's 200px floor. Edge to edge it clears it. */}
              <div
                ref={slotRef}
                className="rounded-lg"
                style={{ marginLeft: -20, marginRight: -20, aspectRatio: "16 / 9", minHeight: 200, background: "#000" }}
              />

              <div className="mt-4">
                <div style={{ fontFamily: displayFont, fontSize: 20, fontWeight: 600, color: colors.text }} className="line-clamp-2">
                  {track?.title || "Nothing playing"}
                </div>
                <div style={{ fontSize: 14, color: colors.textMuted, marginTop: 4 }} className="truncate">
                  {track?.artist || ""}
                </div>
              </div>

              <div onClick={seek} className="mt-4" style={{ height: 4, background: "rgba(255,255,255,0.16)", borderRadius: 2, cursor: "pointer" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: colors.text, borderRadius: 2 }} />
              </div>
              <div className="flex items-center justify-between mt-2" style={{ fontSize: 11.5, color: colors.textMuted }}>
                <span>{formatTime(position)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              <div className="flex items-center justify-between mt-5 px-2">
                <button onClick={() => setShuffle((v) => !v)} aria-label="Shuffle" style={{ background: "none", border: "none", cursor: "pointer", color: shuffle ? colors.accentLight : colors.textMuted }}>
                  <Shuffle size={22} />
                </button>
                <button onClick={() => skip(-1)} aria-label="Previous" style={{ background: "none", border: "none", cursor: "pointer", color: colors.text }}>
                  <SkipBack size={30} />
                </button>
                <button
                  onClick={toggle}
                  aria-label={playing ? "Pause" : "Play"}
                  style={{ background: colors.text, border: "none", borderRadius: "50%", width: 68, height: 68, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {playing ? <Pause size={28} color={colors.bg} /> : <Play size={28} color={colors.bg} style={{ marginLeft: 3 }} />}
                </button>
                <button onClick={() => skip(1)} aria-label="Next" style={{ background: "none", border: "none", cursor: "pointer", color: colors.text }}>
                  <SkipForward size={30} />
                </button>
                <button onClick={() => setRepeat((v) => !v)} aria-label="Repeat" style={{ background: "none", border: "none", cursor: "pointer", color: repeat ? colors.accentLight : colors.textMuted }}>
                  <Repeat size={22} />
                </button>
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: colors.textMuted, textTransform: "uppercase", margin: "20px 0 8px" }}>
                Up next
              </div>
              {/* Only the queue scrolls. Everything above it holds still, which
                  is what keeps the player from being repositioned mid-scroll. */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {(tracks || []).map(trackRow)}
              </div>
            </div>
          ) : (
            <div className="relative flex-1 min-h-0 flex flex-col lg:flex-row gap-8 px-6 md:px-10 pb-6">
              <div className="flex-1 flex flex-col items-center justify-start gap-5">
                {stage === "song" && (
                  <div
                    className="rounded-lg"
                    style={{
                      // Driven by the height available, not a fixed width. The
                      // column does not scroll any more, so a size that assumes
                      // a tall window gets cut off by the bar on a short one.
                      height: "min(400px, 38vh)", aspectRatio: "1 / 1", width: "auto",
                      background: track?.artworkUrl ? `url(${track.artworkUrl}) center/cover no-repeat` : colors.bgElevated,
                      boxShadow: "0 30px 70px rgba(0,0,0,0.6)",
                    }}
                  />
                )}
                {/* The slot the player sits in. Bigger in Video, but present and
                    uncovered in both — that is the condition it plays under, and
                    never below YouTube's 200px floor. */}
                <div
                  ref={slotRef}
                  className="rounded-lg"
                  style={{
                    height: stage === "video" ? "min(495px, 62vh)" : "min(236px, 26vh)",
                    minHeight: 200,
                    maxWidth: stage === "video" ? "min(880px, 92vw)" : "min(420px, 82vw)",
                    aspectRatio: "16 / 9",
                    width: "auto",
                    background: "#000",
                  }}
                />
              </div>

              <div className="w-full lg:w-[340px] flex-shrink-0 flex flex-col min-h-0">
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: colors.textMuted, textTransform: "uppercase", marginBottom: 12 }}>
                  Up next
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {(tracks || []).map(trackRow)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* The player. One element, always mounted, moved by animating its box. */}
      <div
        style={{
          position: "fixed",
          top: box?.top ?? -9999,
          left: box?.left ?? -9999,
          width: box?.width ?? DOCK_WIDTH,
          height: box?.height ?? DOCK_HEIGHT,
          zIndex: expanded ? 56 : 40,
          borderRadius: 10,
          overflow: "hidden",
          background: "#000",
          boxShadow: expanded ? "none" : "0 16px 40px rgba(0,0,0,0.7)",
          border: expanded ? "none" : `1px solid ${colors.ring}`,
          // No transition on the box. It used to glide between the slot and the
          // dock, which looked like the player drifting loose from the page —
          // it lands where it belongs immediately instead.
        }}
      >
        <div ref={hostRef} className="w-full h-full" />
      </div>

      {/* The bar. Stays across every view, the way a music app's does. */}
      <div
        className="fixed left-0 right-0 flex items-center gap-4 px-3 md:px-6"
        style={{
          bottom: narrow ? NAV_HEIGHT : 0,
          height: BAR_HEIGHT,
          background: colors.bgElevated,
          borderTop: `1px solid ${colors.ring}`,
          zIndex: 58,
        }}
      >
        <div className="absolute left-0 right-0 top-0" style={{ height: 3, background: "rgba(255,255,255,0.10)", cursor: "pointer" }} onClick={seek}>
          <div style={{ height: "100%", width: `${progress}%`, background: colors.accent }} />
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button onClick={() => skip(-1)} aria-label="Previous" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: colors.textMuted }}>
            <SkipBack size={20} />
          </button>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            style={{ background: colors.accent, border: "none", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {playing ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" style={{ marginLeft: 2 }} />}
          </button>
          <button onClick={() => skip(1)} aria-label="Next" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: colors.textMuted }}>
            <SkipForward size={20} />
          </button>
          <span style={{ fontSize: 11.5, color: colors.textMuted, fontVariantNumeric: "tabular-nums" }} className="hidden sm:block">
            {formatTime(position)} / {formatTime(duration)}
          </span>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          {track?.artworkUrl ? (
            <img src={track.artworkUrl} alt="" width={44} height={44} style={{ objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />
          ) : (
            <span style={{ width: 44, height: 44, background: colors.bg, borderRadius: 3, flexShrink: 0 }} />
          )}
          <span className="min-w-0">
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: colors.text }} className="truncate">
              {track?.title || "Nothing playing"}
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: colors.textMuted, marginTop: 2 }} className="truncate">
              {track?.artist || ""}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-4 flex-shrink-0">
          <button onClick={() => setLiked(liked === "up" ? null : "up")} aria-label="Like" className="hidden sm:flex" style={{ background: "none", border: "none", cursor: "pointer", color: liked === "up" ? colors.accentLight : colors.textMuted }}>
            <ThumbsUp size={17} />
          </button>
          <button onClick={() => setLiked(liked === "down" ? null : "down")} aria-label="Dislike" className="hidden sm:flex" style={{ background: "none", border: "none", cursor: "pointer", color: liked === "down" ? colors.accentLight : colors.textMuted }}>
            <ThumbsDown size={17} />
          </button>
          <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="hidden sm:flex" style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted }}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button onClick={() => setRepeat((v) => !v)} aria-label="Repeat" className="hidden sm:flex" style={{ background: "none", border: "none", cursor: "pointer", color: repeat ? colors.accentLight : colors.textMuted }}>
            <Repeat size={17} />
          </button>
          <button onClick={() => setShuffle((v) => !v)} aria-label="Shuffle" className="hidden sm:flex" style={{ background: "none", border: "none", cursor: "pointer", color: shuffle ? colors.accentLight : colors.textMuted }}>
            <Shuffle size={17} />
          </button>
          <button onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Collapse" : "Expand"} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: colors.textMuted }}>
            {expanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </button>
        </div>
      </div>
      {/* A phone gets the rail here instead, where a thumb can reach it. */}
      {narrow && (
        <div
          className="fixed left-0 right-0 bottom-0 flex items-stretch"
          style={{ height: NAV_HEIGHT, background: colors.bg, borderTop: `1px solid ${colors.ring}`, zIndex: 59 }}
        >
          {[
            ["home", "Home", Home],
            ["explore", "Explore", Compass],
            ["library", "Library", Library],
          ].map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => { setView(key); setQuery(""); setMobileSearch(false); setExpanded(false); }}
              className="flex-1 flex flex-col items-center justify-center gap-1"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: view === key ? colors.text : colors.textMuted,
                fontFamily: bodyFont, fontSize: 10.5, fontWeight: view === key ? 700 : 500,
              }}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
