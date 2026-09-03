import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Play, Pause, SkipBack, SkipForward, Search, X, Music, Home, Compass,
  Library, Shuffle, Repeat, Volume2, VolumeX, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Menu, Zap, ListMusic,
  Film, History, ArrowLeft, Clock, TrendingUp, Sparkles, ArrowUpLeft,
  ThumbsUp, Gauge, Link2, Unlink, Minus, Plus, Video, Disc3, Radio, Mic2,
  SlidersHorizontal, RotateCcw,
} from "lucide-react";
import { colors, bodyFont, displayFont } from "../theme";
import OnionMark from "../components/shared/OnionMark";
import BrandWord from "../components/shared/BrandWord";
import ExploreView from "../components/music/ExploreView";
import api from "../api/client";
import {
  DEFAULT_FX,
  FX_PRESETS,
  FX_RATE_MIN,
  FX_RATE_MAX,
  FX_RATE_STEP,
  clampFXRate,
  semitonesFromPitch,
  applySoundFX,
  resumeAudioFXContext,
} from "../utils/audioFX";

/*
 * Onion Music.
 *
 * Full-featured music streaming frontend powered by YouTube and streaming backends.
 * Features dual playback engine:
 * 1. HTML5 <audio> engine for direct stream URLs.
 * 2. YouTube IFrame Player engine for instant, reliable YouTube music & video playback.
 *
 * Includes Song/Video switch, tempo/pitch adjuster, dynamic queue/recommendations,
 * mood filters, album & song search, and media-session lock-screen support.
 */

const SEARCH_DEBOUNCE_MS = 400;
const IFRAME_API = "https://www.youtube.com/iframe_api";

/* Load YouTube Iframe API once */
let apiPromise = null;
function loadYoutubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.YT && typeof window.YT.Player === "function") {
    return Promise.resolve(window.YT);
  }
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (window.YT && typeof window.YT.Player === "function") {
        clearInterval(checkInterval);
        resolve(window.YT);
      }
    }, 50);

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      if (window.YT && typeof window.YT.Player === "function") {
        clearInterval(checkInterval);
        resolve(window.YT);
      }
    };

    if (!document.querySelector(`script[src="${IFRAME_API}"]`)) {
      const script = document.createElement("script");
      script.src = IFRAME_API;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}

/* HTML5 Media Engine */
function mediaEngine(el) {
  return {
    el,
    kind: "media",
    canPitch: true,
    snapsTempo: false,
    dataset: el.dataset || {},
    get loop() {
      return el.loop;
    },
    set loop(value) {
      el.loop = value;
    },
    play: async () => {
      resumeAudioFXContext();
      try {
        return await el.play();
      } catch (err) {
        console.warn("HTML5 audio play notice:", err.message);
      }
    },
    pause: () => el.pause(),
    load: () => el.load(),
    setSource(url, { autoplay } = {}) {
      el.src = url;
      el.load();
      if (autoplay) {
        resumeAudioFXContext();
        const p = el.play();
        if (p && typeof p.catch === "function") {
          p.catch((err) => console.warn("setSource autoplay notice:", err.message));
        }
      }
    },
    get paused() {
      return el.paused;
    },
    get currentTime() {
      return el.currentTime || 0;
    },
    set currentTime(to) {
      el.currentTime = to;
    },
    get duration() {
      return Number.isFinite(el.duration) ? el.duration : 0;
    },
    get muted() {
      return el.muted;
    },
    set muted(value) {
      el.muted = value;
    },
    get volume() {
      return el.volume;
    },
    set volume(value) {
      el.volume = Math.min(1, Math.max(0, value));
    },
    get playbackRate() {
      return el.playbackRate;
    },
  };
}

function extractVideoId(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const match = s.match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/|\/v\/|^)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : s;
}

/* YouTube IFrame Player Engine */
function youtubeEngine(player) {
  return {
    player,
    kind: "youtube",
    canPitch: true,
    snapsTempo: true,
    dataset: {},
    loop: false,
    get playbackRate() {
      try {
        return player?.getPlaybackRate?.() || 1;
      } catch {
        return 1;
      }
    },
    get rateList() {
      try {
        const list = player?.getAvailablePlaybackRates?.();
        return list?.length ? list : YT_RATES;
      } catch {
        return YT_RATES;
      }
    },
    play: () => {
      try {
        player?.playVideo?.();
      } catch (err) {
        console.warn("yt play error:", err);
      }
      return Promise.resolve();
    },
    pause: () => {
      try {
        player?.pauseVideo?.();
      } catch (err) {
        console.warn("yt pause error:", err);
      }
    },
    load: () => {},
    setSource(source, { autoplay } = {}) {
      try {
        const id = extractVideoId(source);
        if (!id) return;
        if (autoplay) {
          player?.loadVideoById?.(id);
          try {
            player?.playVideo?.();
          } catch {}
        } else {
          player?.cueVideoById?.(id);
        }
      } catch (err) {
        console.warn("yt setSource error:", err);
      }
    },
    get paused() {
      try {
        return player?.getPlayerState?.() !== 1;
      } catch {
        return true;
      }
    },
    get currentTime() {
      try {
        return player?.getCurrentTime?.() || 0;
      } catch {
        return 0;
      }
    },
    set currentTime(to) {
      try {
        player?.seekTo?.(to, true);
      } catch {}
    },
    get duration() {
      try {
        return player?.getDuration?.() || 0;
      } catch {
        return 0;
      }
    },
    get muted() {
      try {
        return Boolean(player?.isMuted?.());
      } catch {
        return false;
      }
    },
    set muted(value) {
      try {
        if (value) player?.mute?.();
        else player?.unMute?.();
      } catch {}
    },
    get volume() {
      try {
        return (player?.getVolume?.() ?? 100) / 100;
      } catch {
        return 1;
      }
    },
    set volume(value) {
      try {
        player?.setVolume?.(Math.round(value * 100));
      } catch {}
    },
  };
}

function sourceOf(track) {
  if (!track) return "";
  return track.streamUrl || track.sourceId || track.id || "";
}

const STAGE_MS = 560;
const BAR_REVEAL_AT = 120;
const SHEET_PEEK = 66;

const RAIL_WIDTH = 232;
const BAR_HEIGHT = 76;
const NAV_HEIGHT = 58;
const NARROW = "(max-width: 767px)";
const SEEK_STEP = 5;

const MOODS = [
  "Trending", "New releases", "Bollywood", "Punjabi", "Pop",
  "Romance", "Work out", "Energise", "Feel good", "Sleep",
  "Commute", "Relax", "Party", "Sad", "Focus", "Podcasts",
];

const RECENT_KEY = "onion.music.recent";
const LIKED_KEY = "onion.music.liked";
const SEARCHES_KEY = "onion.music.searches";

const SHORTCUTS = [
  ["New releases", Sparkles, "new songs 2026"],
  ["Charts", TrendingUp, "top songs india"],
  ["Moods & Genres", Music, "lofi chill songs"],
  ["Podcasts", Radio, "podcast hindi"],
];

const CURATED_DEFAULT_TRACKS = [
  {
    id: "saavn_e-5Sl38y",
    source: "saavn",
    sourceId: "e-5Sl38y",
    title: "Toxic",
    artist: "AP Dhillon",
    album: "Toxic",
    artworkUrl: "https://c.saavncdn.com/784/Toxic-English-2020-20201008032450-500x500.jpg",
    streamUrl: "https://aac.saavncdn.com/784/622dd2177187ea5a7f56535de2906ed2_320.mp4",
    durationSec: 184,
  },
  {
    id: "saavn_rjkrTnma",
    source: "saavn",
    sourceId: "rjkrTnma",
    title: "Kesariya",
    artist: "Arijit Singh, Pritam",
    album: "Brahmastra",
    artworkUrl: "https://c.saavncdn.com/871/Brahmastra-Original-Motion-Picture-Soundtrack-Hindi-2022-20221006155213-500x500.jpg",
    streamUrl: "https://aac.saavncdn.com/871/c2febd353f3a076a406fa37510f31f9f_320.mp4",
    durationSec: 268,
  },
  {
    id: "saavn_OPuNmCJG",
    source: "saavn",
    sourceId: "OPuNmCJG",
    title: "Shararat",
    artist: "Badshah, Jasmine Sandlas",
    album: "Shararat",
    artworkUrl: "https://c.saavncdn.com/532/Shararat-From-Dhurandhar-Hindi-2025-20251215084216-500x500.jpg",
    streamUrl: "https://aac.saavncdn.com/532/63933d59147ec7011e635281beccb716_320.mp4",
    durationSec: 224,
  },
  {
    id: "saavn_yDnFw7my",
    source: "saavn",
    sourceId: "yDnFw7my",
    title: "Chaleya",
    artist: "Anirudh Ravichander, Arijit Singh",
    album: "Jawan",
    artworkUrl: "https://c.saavncdn.com/179/World-Music-Day-Best-Of-Bollywood-Hits-Hindi-2026-20260622111029-500x500.jpg",
    streamUrl: "https://aac.saavncdn.com/179/1be373323edc90024d93873d85f644ec_320.mp4",
    durationSec: 200,
  },
  {
    id: "saavn_Paem2Kf1",
    source: "saavn",
    sourceId: "Paem2Kf1",
    title: "Starboy",
    artist: "The Weeknd ft. Daft Punk",
    album: "Starboy",
    artworkUrl: "https://c.saavncdn.com/372/Starboy-English-2016-500x500.jpg",
    streamUrl: "https://aac.saavncdn.com/372/38de816bee7a6df4607f1f0e6822c5bc_320.mp4",
    durationSec: 230,
  },
  {
    id: "saavn_-anQDrP1",
    source: "saavn",
    sourceId: "-anQDrP1",
    title: "Despacito",
    artist: "Luis Fonsi ft. Daddy Yankee",
    album: "Despacito",
    artworkUrl: "https://c.saavncdn.com/312/Jing-Dian-Liu-Xing-Chang-Pian-Hang-English-2026-20260710055134-500x500.jpg",
    streamUrl: "https://aac.saavncdn.com/312/2317b05d93c969303b30fb0f318318c3_320.mp4",
    durationSec: 228,
  },
];

function readStorage(key, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function channelLabel(name) {
  return String(name || "")
    .replace(/vevo$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}
/* Scrollable card row with YouTube Music-style left/right arrow navigation */
function CardRow({ title, items, onPlay, colors, displayFont }) {
  const rowRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollState = () => {
    const el = rowRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  const doScroll = (dir) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 540, behavior: "smooth" });
  };

  if (!items || items.length === 0) return null;
  return (
    <div className="mb-10" style={{ position: "relative" }}>
      <div style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 600, color: colors.text, marginBottom: 14 }}>
        {title}
      </div>
      <div style={{ position: "relative" }}>
        {canScrollLeft && (
          <button
            onClick={() => doScroll(-1)}
            aria-label="Scroll left"
            className="hidden md:flex items-center justify-center cursor-pointer"
            style={{
              position: "absolute", left: -16, top: 80, transform: "translateY(-50%)",
              zIndex: 5, width: 40, height: 40, borderRadius: "50%",
              background: "rgba(18,12,28,0.92)", border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            }}
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => doScroll(1)}
            aria-label="Scroll right"
            className="hidden md:flex items-center justify-center cursor-pointer"
            style={{
              position: "absolute", right: -16, top: 80, transform: "translateY(-50%)",
              zIndex: 5, width: 40, height: 40, borderRadius: "50%",
              background: "rgba(18,12,28,0.92)", border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            }}
          >
            <ChevronRight size={20} />
          </button>
        )}
        <div
          ref={rowRef}
          onScroll={updateScrollState}
          className="flex gap-4 pb-3"
          style={{ overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {items.map((t) => (
            <button
              key={t.sourceId || t.id}
              onClick={() => onPlay(t)}
              className="flex-shrink-0 text-left group"
              style={{ width: 170, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <div
                className="relative rounded-lg overflow-hidden shadow-lg"
                style={{
                  width: 170, height: 170,
                  background: t.artworkUrl ? `url(${t.artworkUrl}) center/cover no-repeat` : colors.bgElevated,
                  border: `1px solid ${colors.ring}`,
                }}
              >
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
                    <Play size={22} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
                  </div>
                </span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.text, marginTop: 10 }} className="line-clamp-2">
                {t.title}
              </div>
              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 3 }} className="truncate">
                {t.artist}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MusicPage() {
  const [view, setView] = useState("home");
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState("songs");
  const [searching, setSearching] = useState(false);
  const [tracks, setTracks] = useState(CURATED_DEFAULT_TRACKS);
  const [albums, setAlbums] = useState([]);
  const [explore, setExplore] = useState({ albums: [], top: [] });
  const [forYou, setForYou] = useState([]);
  const [recent, setRecent] = useState(() => {
    const raw = readStorage(RECENT_KEY);
    const valid = raw
      .filter((item) => item && item.source !== "peertube" && !item.streamUrl?.includes("peertube"))
      .map((item) => {
        if (item && !item.streamUrl) {
          const found = CURATED_DEFAULT_TRACKS.find(
            (t) =>
              t.title?.toLowerCase() === item.title?.toLowerCase() ||
              (t.sourceId || t.id) === (item.sourceId || item.id)
          );
          if (found) return { ...item, streamUrl: found.streamUrl };
        }
        return item;
      })
      .filter((item) => item && item.streamUrl);
    writeStorage(RECENT_KEY, valid);
    return valid;
  });

  const [nowPlaying, setNowPlaying] = useState(null);
  const [queue, setQueue] = useState([]);
  const [likedList, setLikedList] = useState(() => readStorage(LIKED_KEY));
  const [error, setError] = useState(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [displayMode, setDisplayMode] = useState("song");

  const [fx, setFx] = useState(DEFAULT_FX);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);

  const closeDrawer = useCallback(() => {
    setDrawerClosing(true);
    setTimeout(() => {
      setRatesOpen(false);
      setDrawerClosing(false);
    }, 200);
  }, []);

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  const [railExpanded, setRailExpanded] = useState(true);
  const RAIL_NARROW = 72;
  const RAIL_WIDE = 240;
  const railW = railExpanded ? RAIL_WIDE : RAIL_NARROW;
  const [expanded, setExpanded] = useState(false);
  const [stageMounted, setStageMounted] = useState(false);
  const [stageIn, setStageIn] = useState(false);
  const [barVisible, setBarVisible] = useState(true);

  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(NARROW).matches
  );
  const [mobileSearch, setMobileSearch] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searches, setSearches] = useState(() => readStorage(SEARCHES_KEY));
  const [lyricsData, setLyricsData] = useState({ synced: [], plain: "", hasSynced: false, loading: false });
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [stageDragY, setStageDragY] = useState(0);
  const [isDraggingStage, setIsDraggingStage] = useState(false);
  const dragStartYRef = useRef(0);
  const touchStartYRef = useRef(0);

  useEffect(() => {
    const q = window.matchMedia?.(NARROW);
    if (!q) return;
    const onChange = (e) => setNarrow(e.matches);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);

  /* Fetch lyrics from backend /music/lyrics */
  useEffect(() => {
    if (!nowPlaying?.title) {
      setLyricsData({ synced: [], plain: "", hasSynced: false, loading: false });
      return;
    }
    let active = true;
    setLyricsData((prev) => ({ ...prev, loading: true }));
    api
      .get(
        `/music/lyrics?track=${encodeURIComponent(nowPlaying.title)}&artist=${encodeURIComponent(
          nowPlaying.artist || ""
        )}&duration=${nowPlaying.durationSec || nowPlaying.durationSeconds || ""}`
      )
      .then((data) => {
        if (!active) return;
        setLyricsData({
          synced: data.synced || [],
          plain: data.plain || "",
          hasSynced: !!data.hasSynced,
          loading: false,
        });
      })
      .catch(() => {
        if (!active) return;
        setLyricsData({ synced: [], plain: "", hasSynced: false, loading: false });
      });
    return () => {
      active = false;
    };
  }, [nowPlaying?.title, nowPlaying?.artist, nowPlaying?.durationSec, nowPlaying?.durationSeconds]);

  /* Seek within track */
  const seekBy = useCallback((seconds) => {
    const el = mediaElRef.current;
    const cur = el?.currentTime ?? position;
    const maxDur = duration || el?.duration || 999999;
    const to = Math.max(0, Math.min(maxDur, cur + seconds));
    setPosition(to);
    if (el) el.currentTime = to;
    if (audioRef.current) audioRef.current.currentTime = to;
    if (ytPlayerRef.current?.seekTo) {
      try {
        ytPlayerRef.current.seekTo(to, true);
      } catch {}
    }
  }, [duration, position]);

  /* Background / Lockscreen playback via MediaSession API */
  useEffect(() => {
    if (!("mediaSession" in navigator) || !nowPlaying) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: nowPlaying.title || "Onion Music",
        artist: nowPlaying.artist || "Unknown Artist",
        album: nowPlaying.album || "Onion Music",
        artwork: nowPlaying.artworkUrl
          ? [
              { src: nowPlaying.artworkUrl, sizes: "96x96", type: "image/jpeg" },
              { src: nowPlaying.artworkUrl, sizes: "128x128", type: "image/jpeg" },
              { src: nowPlaying.artworkUrl, sizes: "192x192", type: "image/jpeg" },
              { src: nowPlaying.artworkUrl, sizes: "256x256", type: "image/jpeg" },
              { src: nowPlaying.artworkUrl, sizes: "384x384", type: "image/jpeg" },
              { src: nowPlaying.artworkUrl, sizes: "512x512", type: "image/jpeg" },
            ]
          : [],
      });

      navigator.mediaSession.playbackState = playing ? "playing" : "paused";

      navigator.mediaSession.setActionHandler("play", () => {
        if (nowPlaying?.streamUrl) mediaEngineRef.current?.play?.();
        else ytEngineRef.current?.play?.();
        setPlaying(true);
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        if (nowPlaying?.streamUrl) mediaEngineRef.current?.pause?.();
        else ytEngineRef.current?.pause?.();
        setPlaying(false);
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => seekBy(-5));
      navigator.mediaSession.setActionHandler("nexttrack", () => seekBy(5));
      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        seekBy(-(details.seekOffset || 5));
      });
      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        seekBy(details.seekOffset || 5);
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) {
          setPosition(details.seekTime);
          if (mediaElRef.current) mediaElRef.current.currentTime = details.seekTime;
          if (audioRef.current) audioRef.current.currentTime = details.seekTime;
        }
      });
    } catch (e) {
      console.warn("MediaSession error:", e);
    }
  }, [nowPlaying, playing, seekBy]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !("setPositionState" in navigator.mediaSession) || !duration) return;
    try {
      const activeRate = audioRef.current?.playbackRate || (fx.unhook ? fx.tempo : fx.pitch) || 1;
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, duration),
        playbackRate: Math.max(0.1, Math.min(3.0, activeRate)),
        position: Math.min(Math.max(0, position), duration),
      });
    } catch {}
  }, [position, duration, fx]);

  /* Global Keyboard shortcuts:
   * Left/Right arrow keys: skip 5 seconds backward/forward
   * Up/Down arrow keys: volume up/down
   * Space / K: play / pause
   */
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(5);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(-5);
      } else if (e.key === " " || e.key === "k" || e.key === "K") {
        e.preventDefault();
        actionsRef.current.toggle?.();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setVolume((v) => {
          const next = Math.min(1, Number((v + 0.05).toFixed(2)));
          if (mediaElRef.current) mediaElRef.current.volume = next;
          if (audioRef.current) audioRef.current.volume = next;
          return next;
        });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setVolume((v) => {
          const next = Math.max(0, Number((v - 0.05).toFixed(2)));
          if (mediaElRef.current) mediaElRef.current.volume = next;
          if (audioRef.current) audioRef.current.volume = next;
          return next;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [seekBy]);

  const audioRef = useRef(null);
  const mediaEngineRef = useRef(null);
  const ytEngineRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytReadyRef = useRef(false);
  const mediaElRef = useRef(null);
  const tracksRef = useRef(null);
  const queueRef = useRef([]);
  const actionsRef = useRef({});
  const fxRef = useRef(DEFAULT_FX);
  fxRef.current = fx;

  const searchActive = query.trim().length >= 2;
  const searchScreen = (narrow ? mobileSearch : searchFocused) && !searchActive;
  const track = nowPlaying;
  tracksRef.current = tracks;
  queueRef.current = queue;

  const isYouTubeTrack = !track?.streamUrl;

  const selectEngine = useCallback((t) => {
    if (t?.streamUrl) return mediaEngineRef.current;
    return ytEngineRef.current;
  }, []);

  /* Initialize HTML5 Media Engine */
  useEffect(() => {
    const el = mediaElRef.current;
    if (!el) return;
    const engine = mediaEngine(el);
    mediaEngineRef.current = engine;
    if (nowPlaying?.streamUrl) {
      audioRef.current = engine;
    }
    const syncRates = () => {
      applySoundFX(el, ytPlayerRef.current, fxRef.current);
    };
    const handlers = [
      ["play", () => {
        setPlaying(true);
        setBuffering(false);
        syncRates();
      }],
      ["playing", () => {
        setPlaying(true);
        setBuffering(false);
        syncRates();
      }],
      ["ratechange", syncRates],
      ["loadedmetadata", () => {
        setDuration(el.duration || 0);
        syncRates();
      }],
      ["timeupdate", () => {
        if (el && typeof el.currentTime === "number" && !Number.isNaN(el.currentTime)) {
          setPosition(el.currentTime);
        }
      }],
      ["pause", () => setPlaying(false)],
      ["waiting", () => setBuffering(true)],
      ["durationchange", () => setDuration(el.duration || 0)],
      ["ended", () => actionsRef.current.ended?.()],
      ["error", () => setBuffering(false)],
    ];
    for (const [event, handler] of handlers) el.addEventListener(event, handler);
    return () => {
      for (const [event, handler] of handlers) el.removeEventListener(event, handler);
    };
  }, [nowPlaying?.streamUrl]);

  /* Continuous single-source-of-truth synchronization for FX */
  useEffect(() => {
    applySoundFX(mediaElRef.current, ytPlayerRef.current, fx);
  }, [fx]);

  /* Initialize YouTube Iframe Player */
  useEffect(() => {
    let active = true;
    const initialTrack = nowPlaying || CURATED_DEFAULT_TRACKS[0];
    const initialId = extractVideoId(initialTrack?.sourceId || initialTrack?.id || "NJAv_7lHUIU");

    loadYoutubeApi()
      .then((YT) => {
        if (!active) return;
        const container = document.getElementById("onion-yt-player-slot");
        if (!container) return;

        if (ytPlayerRef.current) {
          try {
            ytPlayerRef.current.destroy?.();
          } catch {}
        }

        const player = new YT.Player("onion-yt-player-slot", {
          height: "100%",
          width: "100%",
          videoId: initialId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            playsinline: 1,
            rel: 0,
            enablejsapi: 1,
            origin: typeof window !== "undefined" ? window.location.origin : undefined,
          },
          events: {
            onReady: (event) => {
              if (!active) return;
              ytReadyRef.current = true;
              ytPlayerRef.current = event.target;
              const yt = youtubeEngine(event.target);
              ytEngineRef.current = yt;
              if (!nowPlaying?.streamUrl) {
                audioRef.current = yt;
              }
              try {
                event.target.setVolume(Math.round(volume * 100));
                applySoundFX(mediaElRef.current, event.target, fxRef.current);
              } catch {}
            },
            onStateChange: (event) => {
              if (!active) return;
              const state = event.data;
              if (state === 1) {
                // Playing
                setPlaying(true);
                setBuffering(false);
                try {
                  applySoundFX(mediaElRef.current, event.target, fxRef.current);
                  const dur = event.target.getDuration();
                  if (dur && dur > 0) setDuration(dur);
                } catch {}
              } else if (state === 2) {
                // Paused
                setPlaying(false);
                setBuffering(false);
              } else if (state === 3) {
                // Buffering
                setBuffering(true);
              } else if (state === 0) {
                // Ended
                setPlaying(false);
                setBuffering(false);
                actionsRef.current.ended?.();
              }
            },
            onError: (event) => {
              console.warn("YouTube player error code:", event.data);
              setBuffering(false);
              // Video restricted or unavailable: auto-advance
              if (event.data === 100 || event.data === 101 || event.data === 150) {
                setTimeout(() => {
                  actionsRef.current.skip?.(1);
                }, 1000);
              }
            },
          },
        });

        ytPlayerRef.current = player;
      })
      .catch((err) => console.warn("loadYoutubeApi error:", err));

    return () => {
      active = false;
    };
  }, []);

  const switchDisplayMode = (newMode) => {
    setDisplayMode(newMode);
  };

  /* Fetch initial tracks */
  const loadTracks = () => {
    setError(null);
    api
      .get("/music/tracks?limit=50")
      .then((data) => {
        if (data && data.length) {
          const saavnTracks = data.filter((t) => t && t.source !== "peertube" && !t.streamUrl?.includes("peertube"));
          const finalTracks = saavnTracks.length ? saavnTracks : CURATED_DEFAULT_TRACKS;
          setTracks(finalTracks);
          const rawRecent = readStorage(RECENT_KEY).filter(
            (t) => t && t.source !== "peertube" && t.streamUrl && !t.streamUrl.includes("peertube")
          );
          writeStorage(RECENT_KEY, rawRecent);
          const first = rawRecent[0] || finalTracks[0] || CURATED_DEFAULT_TRACKS[0];
          setNowPlaying(first);
          setQueue(rawRecent.length ? [first, ...finalTracks] : finalTracks);
        } else {
          setTracks(CURATED_DEFAULT_TRACKS);
          const rawRecent = readStorage(RECENT_KEY).filter(
            (t) => t && t.source !== "peertube" && t.streamUrl && !t.streamUrl.includes("peertube")
          );
          writeStorage(RECENT_KEY, rawRecent);
          const first = rawRecent[0] || CURATED_DEFAULT_TRACKS[0];
          setNowPlaying(first);
          setQueue(rawRecent.length ? [first, ...CURATED_DEFAULT_TRACKS] : CURATED_DEFAULT_TRACKS);
        }
      })
      .catch((err) => {
        console.warn("fetchTracks fallback to curated songs:", err.message);
        setTracks(CURATED_DEFAULT_TRACKS);
        const rawRecent = readStorage(RECENT_KEY).filter(
          (t) => t && t.source !== "peertube" && t.streamUrl && !t.streamUrl.includes("peertube")
        );
        writeStorage(RECENT_KEY, rawRecent);
        const first = rawRecent[0] || CURATED_DEFAULT_TRACKS[0];
        setNowPlaying(first);
        setQueue(rawRecent.length ? [first, ...CURATED_DEFAULT_TRACKS] : CURATED_DEFAULT_TRACKS);
      });
  };

  useEffect(() => {
    loadTracks();
  }, []);

  /* Explore view rows */
  useEffect(() => {
    if (view !== "explore" || explore.albums.length || explore.top.length) return;
    let cancelled = false;
    Promise.all([
      api.get("/music/albums?q=new%20album%202026&limit=12").catch(() => []),
      api.get("/music/tracks?limit=8").catch(() => []),
    ]).then(([fetchedAlbums, top]) => {
      if (!cancelled) setExplore({ albums: fetchedAlbums, top });
    });
    return () => {
      cancelled = true;
    };
  }, [view, explore.albums.length, explore.top.length]);

  /* Related songs for seed */
  const seedTrack = recent[0];
  const seedId = seedTrack?.sourceId || seedTrack?.id;
  const seedTitle = seedTrack?.title;
  const seedArtist = seedTrack?.artist;
  useEffect(() => {
    if (!seedId) return;
    let cancelled = false;
    api
      .get(
        `/music/related?title=${encodeURIComponent(seedTitle || "")}` +
          `&artist=${encodeURIComponent(seedArtist || "")}&exclude=${encodeURIComponent(seedId)}&limit=12`
      )
      .then((data) => {
        if (!cancelled && data?.length) setForYou(data);
      })
      .catch((err) => console.warn("forYou notice:", err.message));
    return () => {
      cancelled = true;
    };
  }, [seedId, seedTitle, seedArtist]);

  /* Debounced Search */
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
        if (data.length) {
          setSearches((prev) => {
            const updated = [q, ...prev.filter((t) => t.toLowerCase() !== q.toLowerCase())].slice(0, 8);
            writeStorage(SEARCHES_KEY, updated);
            return updated;
          });
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
  }, [query, searchMode]);

  /* Record history */
  const currentTrackId = track?.sourceId || track?.id;
  useEffect(() => {
    if (!track || !autoplay || !currentTrackId) return;
    setRecent((prev) => {
      const isFirst = (prev[0]?.sourceId || prev[0]?.id) === currentTrackId;
      if (isFirst) return prev;
      const filtered = [track, ...prev.filter((t) => (t.sourceId || t.id) !== currentTrackId)].slice(0, 20);
      writeStorage(RECENT_KEY, filtered);
      return filtered;
    });
  }, [track, autoplay, currentTrackId]);

  /* Loop */
  useEffect(() => {
    if (mediaEngineRef.current) mediaEngineRef.current.loop = repeat;
  }, [repeat]);

  /* High-precision real-time ticker for lyrics and progress sync */
  useEffect(() => {
    if (!playing) return;
    const updatePos = () => {
      const audio = audioRef.current;
      const el = mediaElRef.current;
      const cur = el?.currentTime ?? audio?.currentTime;
      if (typeof cur === "number" && !Number.isNaN(cur)) {
        setPosition(cur);
      }
      const dur = el?.duration ?? audio?.duration;
      if (typeof dur === "number" && dur > 0 && !Number.isNaN(dur)) {
        setDuration(dur);
      }
    };
    const timer = setInterval(updatePos, 80);
    return () => clearInterval(timer);
  }, [playing]);

  /* Lock-screen MediaSession */
  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session || !track || typeof window.MediaMetadata !== "function") return;
    session.metadata = new window.MediaMetadata({
      title: track.title || "Onion Music",
      artist: channelLabel(track.artist) || "Artist",
      album: "Onion TV",
      artwork: track.artworkUrl
        ? [
            { src: track.artworkUrl, sizes: "96x96", type: "image/jpeg" },
            { src: track.artworkUrl, sizes: "256x256", type: "image/jpeg" },
            { src: track.artworkUrl, sizes: "512x512", type: "image/jpeg" },
          ]
        : [],
    });

    const nudge = (delta) => {
      const audio = audioRef.current;
      if (!audio) return;
      const end = duration || 0;
      audio.currentTime = Math.min(end, Math.max(0, audio.currentTime + delta));
    };

    const handlers = [
      ["play", () => actionsRef.current.resume?.()],
      ["pause", () => audioRef.current?.pause?.()],
      ["stop", () => audioRef.current?.pause?.()],
      ["previoustrack", () => actionsRef.current.skip?.(-1)],
      ["nexttrack", () => actionsRef.current.skip?.(1)],
      ["seekbackward", (d) => nudge(-(d?.seekOffset || SEEK_STEP))],
      ["seekforward", (d) => nudge(d?.seekOffset || SEEK_STEP)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {}
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {}
      }
    };
  }, [track, duration]);

  /* Background audio keepalive on screen lock / tab switch */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (globalAudioCtx && globalAudioCtx.state === "suspended") {
          globalAudioCtx.resume().catch(() => {});
        }
        if (mediaElRef.current && playing && mediaElRef.current.paused) {
          mediaElRef.current.play().catch(() => {});
        }
      } else {
        if (globalAudioCtx && globalAudioCtx.state === "suspended") {
          globalAudioCtx.resume().catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [playing]);

  /* Stage animation & overflow lock */
  useEffect(() => {
    if (expanded) {
      setStageMounted(true);
      setBarVisible(!narrow);
      const timer = setTimeout(() => setStageIn(true), 20);
      return () => clearTimeout(timer);
    }
    setStageIn(false);
    setBarVisible(true);
    const timer = setTimeout(() => setStageMounted(false), STAGE_MS);
    return () => clearTimeout(timer);
  }, [expanded, narrow]);

  useEffect(() => {
    if (!stageMounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [stageMounted]);

  const onStageScroll = (e) => {
    if (!narrow) return;
    setBarVisible(e.currentTarget.scrollTop > BAR_REVEAL_AT);
  };

  /* Playback handlers */
  const play = useCallback((t) => {
    if (!t) return;
    setAutoplay(true);
    setNowPlaying(t);
    setPlaying(true);
    setBuffering(false);
    setPosition(0);
    setDuration(t.durationSec || t.durationSeconds || 0);
    if (narrow) {
      setExpanded(true);
    }

    const source = sourceOf(t);
    const engine = selectEngine(t);
    audioRef.current = engine;

    if (t.streamUrl) {
      // Pause YouTube if playing
      try {
        ytEngineRef.current?.pause?.();
      } catch {}
      if (engine) {
        engine.setSource(t.streamUrl, { autoplay: true });
        applySoundFX(mediaElRef.current, ytPlayerRef.current, fxRef.current);
      }
    } else {
      // Pause HTML5 audio if playing
      try {
        mediaEngineRef.current?.pause?.();
      } catch {}
      const id = extractVideoId(source || t.sourceId || t.id);
      if (id) {
        if (ytEngineRef.current) {
          ytEngineRef.current.setSource(id, { autoplay: true });
          applySoundFX(mediaElRef.current, ytPlayerRef.current, fxRef.current);
        } else if (ytPlayerRef.current?.loadVideoById) {
          try {
            ytPlayerRef.current.loadVideoById(id);
            ytPlayerRef.current.playVideo?.();
            applySoundFX(mediaElRef.current, ytPlayerRef.current, fxRef.current);
          } catch {}
        }
      }
    }

    // Dynamic queue recommendations
    api
      .get(
        `/music/related?title=${encodeURIComponent(t.title || "")}` +
          `&artist=${encodeURIComponent(t.artist || "")}&exclude=${encodeURIComponent(t.sourceId || t.id || "")}`
      )
      .then((related) => {
        if (related && related.length) setQueue([t, ...related]);
      })
      .catch(() => {
        setQueue([t, ...(tracksRef.current || []).filter((x) => (x.sourceId || x.id) !== (t.sourceId || t.id))]);
      });
  }, [selectEngine, narrow]);

  const resume = useCallback(() => {
    setAutoplay(true);
    setPlaying(true);
    if (nowPlaying?.streamUrl) {
      mediaEngineRef.current?.play?.();
    } else {
      ytEngineRef.current?.play?.();
      try {
        ytPlayerRef.current?.playVideo?.();
      } catch {}
    }
  }, [nowPlaying?.streamUrl]);

  const toggle = useCallback(() => {
    if (playing) {
      setPlaying(false);
      if (nowPlaying?.streamUrl) {
        mediaEngineRef.current?.pause?.();
      } else {
        ytEngineRef.current?.pause?.();
        try {
          ytPlayerRef.current?.pauseVideo?.();
        } catch {}
      }
    } else {
      resume();
    }
  }, [playing, nowPlaying?.streamUrl, resume]);

  const skip = useCallback((delta) => {
    const list = queueRef.current?.length ? queueRef.current : tracksRef.current;
    if (!list?.length) return;
    if (shuffle && delta > 0) {
      const randomTrack = list[Math.floor(Math.random() * list.length)];
      play(randomTrack);
      return;
    }
    const curId = nowPlaying?.sourceId || nowPlaying?.id;
    const i = list.findIndex((t) => (t.sourceId || t.id) === curId);
    let nextIdx = i + delta;
    if (nextIdx < 0) nextIdx = 0;
    if (nextIdx >= list.length) nextIdx = repeat ? 0 : list.length - 1;
    if (list[nextIdx]) play(list[nextIdx]);
  }, [nowPlaying, shuffle, repeat, play]);

  const onEnded = useCallback(() => {
    if (repeat && nowPlaying) {
      play(nowPlaying);
      return;
    }
    const list = queueRef.current?.length ? queueRef.current : tracksRef.current;
    if (!list?.length) return;
    if (shuffle) {
      play(list[Math.floor(Math.random() * list.length)]);
      return;
    }
    const curId = nowPlaying?.sourceId || nowPlaying?.id;
    const i = list.findIndex((t) => (t.sourceId || t.id) === curId);
    if (i >= 0 && i + 1 < list.length) {
      play(list[i + 1]);
    } else {
      setPlaying(false);
    }
  }, [repeat, nowPlaying, shuffle, play]);

  actionsRef.current = { toggle, skip, resume, ended: onEnded };

  /* Scrubbing */
  const ratioFrom = (event, element) => {
    const r = element.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
  };

  const scrubStart = (event) => {
    if (!duration) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setScrubbing(ratioFrom(event, event.currentTarget) * duration);
  };

  const scrubMove = (event) => {
    if (scrubbing === null || !duration) return;
    setScrubbing(ratioFrom(event, event.currentTarget) * duration);
  };

  const scrubEnd = (event) => {
    if (scrubbing === null) return;
    const to = duration ? ratioFrom(event, event.currentTarget) * duration : 0;
    setPosition(to);
    if (audioRef.current) {
      audioRef.current.currentTime = to;
    }
    setScrubbing(null);
  };

  const scrubHandlers = {
    onPointerDown: scrubStart,
    onPointerMove: scrubMove,
    onPointerUp: scrubEnd,
    onPointerCancel: scrubEnd,
  };

  /* Clean Single-Source-of-Truth FX controls */
  const updateFX = useCallback((patch) => {
    resumeAudioFXContext();
    setFx((prev) => {
      const next = { ...prev, ...patch };
      fxRef.current = next;
      applySoundFX(mediaElRef.current, ytPlayerRef.current, next);
      return next;
    });
  }, []);

  const resetFX = useCallback(() => {
    updateFX(DEFAULT_FX);
  }, [updateFX]);

  const openRates = () => {
    resumeAudioFXContext();
    setRatesOpen(true);
  };

  const setVolumeLevel = (level) => {
    const val = Math.max(0, Math.min(1, level));
    setVolume(val);
    if (muted) setMuted(false);

    if (audioRef.current) {
      audioRef.current.volume = val;
      if (muted) audioRef.current.muted = false;
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);

    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  };

  const toggleLike = (t) => {
    if (!t) return;
    const id = t.sourceId || t.id;
    const exists = likedList.some((x) => (x.sourceId || x.id) === id);
    const updated = exists
      ? likedList.filter((x) => (x.sourceId || x.id) !== id)
      : [t, ...likedList];
    setLikedList(updated);
    writeStorage(LIKED_KEY, updated);
  };

  const isLiked = (t) => {
    if (!t) return false;
    const id = t.sourceId || t.id;
    return likedList.some((x) => (x.sourceId || x.id) === id);
  };

  const openTrack = (t) => {
    if (t.kind === "album") {
      setSearchMode("songs");
      setQuery(t.title);
    } else {
      play(t);
    }
  };

  const shownPosition = scrubbing ?? position;
  const progress = duration > 0 ? (shownPosition / duration) * 100 : 0;
  const list = searchActive && searchMode === "albums" ? albums : tracks;
  const ratesTouched =
    Math.abs(fx.tempo - 1) >= 0.005 ||
    Math.abs(fx.pitch - 1) >= 0.005 ||
    fx.reverb > 0.01 ||
    fx.preset !== "studio";

  const activeLyricIndex = React.useMemo(() => {
    if (!lyricsData.synced?.length) return -1;
    let idx = -1;
    for (let i = 0; i < lyricsData.synced.length; i++) {
      if (lyricsData.synced[i].time <= shownPosition + 0.12) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyricsData.synced, shownPosition]);

  const activeLyricRef = useRef(null);
  const mobileLyricsContainerRef = useRef(null);
  const desktopLyricsContainerRef = useRef(null);

  useEffect(() => {
    if (displayMode === "lyrics" && activeLyricRef.current) {
      const activeEl = activeLyricRef.current;
      const container = narrow ? mobileLyricsContainerRef.current : desktopLyricsContainerRef.current;
      if (container) {
        const targetTop = activeEl.offsetTop - container.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
        container.scrollTo({
          top: Math.max(0, targetTop),
          behavior: "smooth",
        });
      }
    }
  }, [activeLyricIndex, displayMode, narrow]);

  const cardRow = (title, items) => (
    <CardRow
      key={title}
      title={title}
      items={items}
      onPlay={openTrack}
      colors={colors}
      displayFont={displayFont}
    />
  );

  const trackRow = (t, i) => {
    const active = (t.sourceId || t.id) === (nowPlaying?.sourceId || nowPlaying?.id);
    return (
      <div
        key={t.sourceId || t.id || i}
        className="w-full flex items-center gap-3 text-left rounded-lg p-2.5 transition-colors group hover:bg-white/[0.06]"
        style={{
          background: active ? "rgba(255,255,255,0.08)" : "transparent",
        }}
      >
        <button
          onClick={() => openTrack(t)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left bg-transparent border-none cursor-pointer p-0"
        >
          <span style={{ width: 22, fontSize: 12, color: active ? colors.accentLight : colors.textMuted, flexShrink: 0, textAlign: "center" }}>
            {active && playing ? "▶" : i + 1}
          </span>
          {t.artworkUrl ? (
            <img src={t.artworkUrl} alt="" width={48} height={48} className="rounded object-cover flex-shrink-0 shadow" />
          ) : (
            <div className="w-12 h-12 rounded bg-neutral-800 flex-shrink-0 flex items-center justify-center">
              <Music size={20} color={colors.textMuted} />
            </div>
          )}
          <span className="min-w-0 flex-1">
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: active ? colors.accentLight : colors.text }} className="truncate">
              {t.title}
            </span>
            <span style={{ display: "block", fontSize: 12, color: colors.textMuted, marginTop: 2 }} className="truncate">
              {t.artist}
            </span>
          </span>
        </button>

        {t.durationSeconds ? (
          <span style={{ fontSize: 12, color: colors.textMuted, flexShrink: 0 }} className="font-mono">
            {formatTime(t.durationSeconds)}
          </span>
        ) : null}

        <button
          onClick={() => toggleLike(t)}
          className="p-1.5 rounded-full bg-transparent border-none cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: isLiked(t) ? colors.accentLight : colors.textMuted, opacity: isLiked(t) ? 1 : undefined }}
          aria-label="Like"
        >
          <ThumbsUp size={16} fill={isLiked(t) ? colors.accentLight : "none"} />
        </button>
      </div>
    );
  };

  const railItem = (key, label, Icon) => {
    const isActive = view === key;
    return (
      <button
        key={key}
        onClick={() => { setView(key); setQuery(""); }}
        title={!railExpanded ? label : undefined}
        style={{
          display: "flex",
          flexDirection: railExpanded ? "row" : "column",
          alignItems: "center",
          justifyContent: railExpanded ? "flex-start" : "center",
          gap: railExpanded ? 16 : 4,
          width: "100%",
          borderRadius: 10,
          background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
          border: "none",
          cursor: "pointer",
          padding: railExpanded ? "12px 16px" : "10px 0",
          color: isActive ? colors.text : colors.textMuted,
          fontFamily: bodyFont,
          fontSize: railExpanded ? 14.5 : 10,
          fontWeight: isActive ? 700 : 500,
          transition: "background 0.15s, color 0.15s",
        }}
      >
        <Icon size={railExpanded ? 20 : 22} color={isActive ? colors.accentLight : colors.textMuted} />
        <span style={{ whiteSpace: "nowrap", overflow: "hidden" }}>{label}</span>
      </button>
    );
  };

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont, color: colors.text }}>
      {/* HTML5 Audio element */}
      <audio ref={mediaElRef} crossOrigin="anonymous" preload="auto" playsInline style={{ display: "none" }} />

      {/* Global persistent YouTube Player host */}
      <div
        id="onion-yt-global-wrapper"
        style={{
          position: "fixed",
          transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          ...(expanded && displayMode === "video"
            ? {
                top: "50%",
                left: narrow ? "50%" : "calc(50% - 160px)",
                transform: "translate(-50%, -50%)",
                width: narrow ? "min(92vw, 440px)" : "min(58vw, 720px)",
                aspectRatio: "16 / 9",
                zIndex: 66,
                opacity: 1,
                pointerEvents: "auto",
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: "0 25px 70px rgba(0,0,0,0.95), 0 0 40px rgba(123,38,133,0.35)",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "#000",
              }
            : {
                bottom: -9999,
                right: -9999,
                width: 1,
                height: 1,
                zIndex: -1,
                opacity: 0,
                pointerEvents: "none",
                background: "transparent",
              }),
        }}
      >
        <div id="onion-yt-player-slot" style={{ width: "100%", height: "100%" }} />
      </div>

      <style>{`
        .onion-search, .onion-search *, .onion-search:focus-within {
          outline: none !important;
          box-shadow: none !important;
          -webkit-tap-highlight-color: transparent;
        }
        .onion-volume {
          width: 0;
          opacity: 0;
          margin-left: 0;
          height: 4px;
          appearance: none;
          background: rgba(255,255,255,0.25);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
          transition: width 220ms ease, opacity 180ms ease, margin-left 220ms ease;
        }
        .group\\/vol:hover .onion-volume,
        .onion-volume:focus-visible { width: 84px; opacity: 1; margin-left: 10px; }
        .onion-volume::-webkit-slider-thumb {
          appearance: none;
          width: 12px; height: 12px; border-radius: 50%;
          background: #fff; cursor: pointer;
        }
        .onion-rate {
          flex: 1;
          height: 4px;
          appearance: none;
          background: rgba(255,255,255,0.18);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }
        .onion-rate::-webkit-slider-thumb {
          appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: ${colors.accent}; cursor: pointer;
        }
        @keyframes vinyl-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes onionDrawerUp {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.97);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes onionDrawerDown {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(20px) scale(0.97);
          }
        }
      `}</style>

      {/* Left Navigation Rail (Desktop) — YouTube Music style collapsible */}
      <div
        className="hidden md:flex flex-col fixed left-0 top-0"
        style={{
          width: railW,
          bottom: BAR_HEIGHT,
          borderRight: `1px solid ${colors.ring}`,
          zIndex: 30,
          background: colors.bg,
          transition: "width 200ms cubic-bezier(0.16,1,0.3,1)",
          overflowX: "hidden",
          overflowY: "auto",
          paddingTop: 12,
        }}
      >
        {/* Top: Hamburger + Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: railExpanded ? "flex-start" : "center",
            gap: 12,
            padding: railExpanded ? "6px 14px 16px" : "6px 0 14px",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setRailExpanded((v) => !v)}
            aria-label="Toggle sidebar"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: colors.textMuted, display: "flex", alignItems: "center",
              justifyContent: "center",
              padding: 6, borderRadius: 8, flexShrink: 0,
            }}
            className="hover:bg-white/10 hover:text-white transition-colors"
          >
            <Menu size={22} />
          </button>
          {railExpanded && (
            <Link
              to="/music"
              onClick={() => setView("home")}
              title="Onion Music Home"
              style={{
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <OnionMark height={58} />
              <BrandWord word="music" height={16} />
            </Link>
          )}
        </div>

        {/* Nav items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px", flex: 1 }}>
          {railItem("home", "Home", Home)}
          {railItem("explore", "Explore", Compass)}
          {railItem("history", "History", History)}
          {railItem("library", "Library", Library)}

          {/* Movies link directly in primary rail */}
          <Link
            to="/"
            title={!railExpanded ? "Movies" : undefined}
            style={{
              display: "flex",
              flexDirection: railExpanded ? "row" : "column",
              alignItems: "center",
              justifyContent: railExpanded ? "flex-start" : "center",
              gap: railExpanded ? 16 : 4,
              width: "100%",
              borderRadius: 10,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: railExpanded ? "12px 16px" : "10px 0",
              color: colors.textMuted,
              fontFamily: bodyFont,
              fontSize: railExpanded ? 14.5 : 10,
              fontWeight: 500,
              textDecoration: "none",
              transition: "background 0.15s, color 0.15s",
            }}
            className="hover:bg-white/10 hover:text-white"
          >
            <Film size={railExpanded ? 20 : 22} color={colors.textMuted} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden" }}>Movies</span>
          </Link>

          {railExpanded && (
            <>
              <div style={{ borderTop: `1px solid ${colors.ring}`, margin: "12px 8px" }} />
              <button
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${colors.ring}`,
                  borderRadius: 999, cursor: "pointer",
                  color: colors.text, fontFamily: bodyFont, fontSize: 14, fontWeight: 600,
                  padding: "9px 18px", width: "100%",
                  transition: "background 0.15s",
                }}
              >
                <Plus size={18} /> New playlist
              </button>
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12, padding: "0 8px" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>Liked music</div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>⚡ Auto playlist</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        .music-shell { padding-left: 0; padding-bottom: 150px; }
        @media (min-width: 768px) { .music-shell { padding-left: ${railW}px; padding-bottom: 96px; transition: padding-left 200ms cubic-bezier(0.16,1,0.3,1); } }
      `}</style>

      <div className="music-shell">
        {/* Top Search Bar */}
        <div
          className="sticky top-0 flex items-center gap-3 px-4 md:px-8 py-3.5 backdrop-blur-md"
          style={{ background: "rgba(12,8,18,0.85)", borderBottom: `1px solid ${colors.ring}`, zIndex: 25 }}
        >
          {/* When sidebar is collapsed on desktop, show big Onion Music logo outside sidebar */}
          {!narrow && !railExpanded && (
            <Link
              to="/music"
              onClick={() => setView("home")}
              className="flex items-center gap-1.5 flex-shrink-0 mr-2"
              style={{ textDecoration: "none" }}
            >
              <OnionMark height={58} />
              <BrandWord word="music" height={16} />
            </Link>
          )}
          {narrow && !mobileSearch && (
            <>
              <Link to="/music" className="flex items-center gap-1" style={{ textDecoration: "none" }}>
                <OnionMark height={58} />
                <BrandWord word="music" height={15} />
              </Link>
              <button
                onClick={() => setMobileSearch(true)}
                aria-label="Search"
                className="ml-auto p-2 text-neutral-400 bg-transparent border-none cursor-pointer"
              >
                <Search size={22} />
              </button>
            </>
          )}

          {(!narrow || mobileSearch) && (
            <div
              className="onion-search flex items-center gap-3 px-4 py-2.5 rounded-full w-full mx-auto"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: `1px solid ${colors.ring}`,
                maxWidth: 640,
              }}
            >
              {narrow && mobileSearch ? (
                <button
                  onClick={() => { setQuery(""); setMobileSearch(false); }}
                  aria-label="Back"
                  className="bg-transparent border-none cursor-pointer text-neutral-400 p-0"
                >
                  <ArrowLeft size={20} />
                </button>
              ) : (
                <Search size={18} color={colors.textMuted} />
              )}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search songs, artists, albums, moods..."
                autoFocus={mobileSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                className="bg-transparent flex-1 text-white text-sm outline-none border-none"
              />
              {(query || mobileSearch) && (
                <button
                  onClick={() => { setQuery(""); setMobileSearch(false); }}
                  aria-label="Clear"
                  className="bg-transparent border-none cursor-pointer text-neutral-400 p-0"
                >
                  <X size={17} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div
          className="px-4 md:px-8 pt-5"
          style={{ paddingBottom: BAR_HEIGHT + (narrow ? NAV_HEIGHT : 0) + 40 }}
        >
          {/* Quick Search Screen */}
          {searchScreen && (
            <div>
              {searches.length > 0 && (
                <>
                  <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8, fontWeight: 600 }}>Recent Searches</div>
                  <div className="flex flex-col gap-1 mb-6">
                    {searches.map((term) => (
                      <button
                        key={term}
                        onClick={() => setQuery(term)}
                        className="flex items-center gap-3 text-left py-2.5 px-3 rounded-lg hover:bg-white/[0.06] bg-transparent border-none cursor-pointer"
                      >
                        <Clock size={16} color={colors.textMuted} />
                        <span style={{ flex: 1, fontSize: 14.5, color: colors.text }}>{term}</span>
                        <ArrowUpLeft size={16} color={colors.textMuted} />
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {SHORTCUTS.map(([label, Icon, term]) => (
                  <button
                    key={label}
                    onClick={() => setQuery(term)}
                    className="flex flex-col items-start gap-3 rounded-xl p-4 text-left transition-all hover:scale-[1.02]"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: `1px solid ${colors.ring}`,
                      cursor: "pointer",
                    }}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                      <Icon size={20} color={colors.accentLight} />
                    </div>
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: colors.text }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mood Chips Bar */}
          {!searchActive && !searchScreen && (
            <div className="flex gap-2.5 overflow-x-auto pb-5 mb-2" style={{ scrollbarWidth: "none" }}>
              {MOODS.map((mood) => (
                <button
                  key={mood}
                  onClick={() => { setSearchMode("songs"); setQuery(`${mood} songs`); }}
                  className="flex-shrink-0 transition-all hover:bg-white/15"
                  style={{
                    fontFamily: bodyFont, fontSize: 13, fontWeight: 600, color: colors.text,
                    background: "rgba(255,255,255,0.07)", border: `1px solid ${colors.ring}`,
                    borderRadius: 999, padding: "8px 18px", cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  {mood}
                </button>
              ))}
            </div>
          )}

          {/* Search Result Mode Switcher */}
          {searchActive && (
            <div className="flex items-center gap-2 pb-5">
              {["songs", "albums"].map((m) => (
                <button
                  key={m}
                  onClick={() => setSearchMode(m)}
                  style={{
                    fontFamily: bodyFont, fontSize: 13, fontWeight: 600, textTransform: "capitalize",
                    color: searchMode === m ? colors.bg : colors.text,
                    background: searchMode === m ? colors.text : "rgba(255,255,255,0.07)",
                    border: `1px solid ${colors.ring}`, borderRadius: 999, padding: "6px 18px", cursor: "pointer",
                  }}
                >
                  {m}
                </button>
              ))}
              <span style={{ fontSize: 13, color: colors.textMuted, marginLeft: 8 }}>
                {searching ? "Searching songs…" : `Results for "${query.trim()}"`}
              </span>
            </div>
          )}

          {/* Views Rendering */}
          {searchScreen ? null : (view === "history" || view === "library") && !searchActive ? (
            <div>
              <div style={{ fontFamily: displayFont, fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
                {view === "history" ? "History" : "Library (Liked Songs)"}
              </div>
              {view === "history" ? (
                recent.length ? (
                  <>
                    {cardRow("Recently Played", recent)}
                    <div style={{ fontFamily: displayFont, fontSize: 20, fontWeight: 600, margin: "24px 0 12px" }}>
                      All History
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
                      {recent.map(trackRow)}
                    </div>
                  </>
                ) : (
                  <div className="text-neutral-400 py-12 text-center">
                    <History size={36} className="mx-auto mb-3 opacity-60" />
                    <p>No history yet. Songs you play will appear here.</p>
                  </div>
                )
              ) : (
                likedList.length ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
                    {likedList.map(trackRow)}
                  </div>
                ) : (
                  <div className="text-neutral-400 py-12 text-center">
                    <Library size={36} className="mx-auto mb-3 opacity-60" />
                    <p>No liked songs yet. Like songs using the 👍 button to add them here.</p>
                  </div>
                )
              )}
            </div>
          ) : view === "explore" && !searchActive ? (
            <ExploreView
              shortcuts={SHORTCUTS}
              onShortcut={setQuery}
              albums={explore.albums}
              top={explore.top}
              moods={MOODS}
              onMood={(mood) => setQuery(`${mood} songs`)}
              cardRow={cardRow}
              trackRow={trackRow}
            />
          ) : list === null ? (
            <div className="space-y-3 animate-pulse">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ height: 64, background: colors.bgElevated, borderRadius: 10 }} />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div style={{ color: colors.textMuted, fontSize: 14.5, paddingTop: 40, textAlign: "center" }}>
              <Music size={36} className="mx-auto mb-3 opacity-60" />
              <p className="max-w-md mx-auto mb-4">{error || "Search for a song, artist, or album."}</p>
              {error && (
                <button
                  onClick={loadTracks}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-purple-600 text-white border-none cursor-pointer hover:bg-purple-700 transition-colors"
                >
                  Retry Loading Songs
                </button>
              )}
            </div>
          ) : (
            <div>
              {!searchActive && recent.length > 0 && cardRow("Listen again", recent)}
              {!searchActive && forYou.length > 0 && cardRow(`Recommended for You`, forYou)}
              {!searchActive && cardRow("Trending Music in India", list.slice(0, 12))}

              <div style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 600, margin: "28px 0 14px" }}>
                {searchActive ? `Top Results` : `Quick Picks`}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
                {list.map(trackRow)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Now-Playing Fullscreen Stage */}
      {stageMounted && (
        <div
          onTouchStart={(e) => {
            dragStartYRef.current = e.touches[0].clientY;
            setIsDraggingStage(false);
            setStageDragY(0);
          }}
          onTouchMove={(e) => {
            if (!dragStartYRef.current) return;
            const delta = e.touches[0].clientY - dragStartYRef.current;
            if (delta > 8) {
              // Pulling down in real-time
              setIsDraggingStage(true);
              setStageDragY(delta);
            } else if (delta < -30) {
              // Swiping up -> open Up Next
              setMobileQueueOpen(true);
              dragStartYRef.current = 0;
            }
          }}
          onTouchEnd={() => {
            if (stageDragY > 95) {
              // Dragged down past threshold -> close smoothly!
              setIsDraggingStage(false);
              setStageDragY(0);
              setExpanded(false);
            } else {
              // Snap back smoothly
              setIsDraggingStage(false);
              setStageDragY(0);
            }
            dragStartYRef.current = 0;
          }}
          onTouchCancel={() => {
            setIsDraggingStage(false);
            setStageDragY(0);
            dragStartYRef.current = 0;
          }}
          className="fixed inset-0 flex flex-col"
          style={{
            background: colors.bg,
            zIndex: 55,
            paddingBottom: 0,
            transform: !stageIn
              ? "translateY(100%)"
              : isDraggingStage
              ? `translateY(${Math.max(0, stageDragY)}px)`
              : "translateY(0)",
            transition: isDraggingStage
              ? "none"
              : `transform ${STAGE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            willChange: "transform",
          }}
        >
          {/* Ambient Blurred Backdrop */}
          {track?.artworkUrl && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${track.artworkUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(90px) saturate(1.8)",
                opacity: 0.35,
                transform: "scale(1.2)",
              }}
            />
          )}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(12,8,18,0.7)" }} />

          {/* Top Stage Bar */}
          <div className="relative flex items-center justify-between px-6 pt-5 pb-2">
            <button
              onClick={() => {
                setExpanded(false);
              }}
              aria-label="Collapse"
              className="p-2 text-white bg-transparent border-none cursor-pointer flex items-center"
            >
              <ChevronDown size={28} />
            </button>

            {/* Mode Switcher: Song | Lyrics */}
            <div className="flex items-center rounded-full p-1 bg-white/10 border border-white/10">
              <button
                onClick={() => switchDisplayMode("song")}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold border-none cursor-pointer transition-all"
                style={{
                  background: displayMode === "song" ? colors.accent : "transparent",
                  color: "#fff",
                }}
              >
                <Disc3 size={15} /> Song
              </button>
              <button
                onClick={() => switchDisplayMode("lyrics")}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold border-none cursor-pointer transition-all"
                style={{
                  background: displayMode === "lyrics" ? colors.accent : "transparent",
                  color: "#fff",
                }}
              >
                <Mic2 size={15} /> Lyrics
              </button>
            </div>

            <button
              onClick={openRates}
              aria-label="Tempo and Pitch"
              className="p-2 bg-transparent border-none cursor-pointer flex items-center"
              style={{ color: ratesTouched ? colors.accentLight : colors.textMuted }}
            >
              <Gauge size={24} />
            </button>
          </div>

          {/* Main Stage Content */}
          {narrow ? (
            <div className="relative flex-1 min-h-0 flex flex-col justify-between px-5 pb-3 overflow-hidden select-none">
              {/* Artwork or Lyrics Container */}
              <div className="flex-1 min-h-0 flex items-center justify-center py-2 relative">
                {displayMode === "song" ? (
                  /* YouTube Music Style Square Poster Artwork */
                  <div
                    onClick={toggle}
                    className="rounded-2xl cursor-pointer overflow-hidden border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.95)] relative flex items-center justify-center select-none active:scale-98 transition-transform"
                    style={{
                      width: "min(290px, 76vw)",
                      aspectRatio: "1 / 1",
                      background: colors.bgElevated,
                    }}
                  >
                    {track?.artworkUrl ? (
                      <img
                        src={track.artworkUrl}
                        alt=""
                        className="w-full h-full object-cover select-none pointer-events-none"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-neutral-900">
                        <Music size={52} color={colors.textMuted} />
                      </div>
                    )}

                    {/* Subtle Gloss Reflection */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: `linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 40%, rgba(0,0,0,0.35) 100%)`,
                      }}
                    />

                    {/* Pause Icon when Paused */}
                    {!playing && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-10">
                        <div className="w-16 h-16 rounded-full bg-black/60 border border-white/25 flex items-center justify-center text-white shadow-2xl">
                          <Pause size={28} />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Premium Synced Lyrics Mode */
                  <div
                    ref={mobileLyricsContainerRef}
                    className="w-full h-full max-h-[44vh] overflow-y-auto px-2 py-4 flex flex-col gap-4 text-center no-scrollbar select-none"
                  >
                    {lyricsData.loading ? (
                      <div className="flex flex-col items-center justify-center py-10 text-neutral-400 gap-2">
                        <Sparkles size={24} className="animate-spin text-purple-400" />
                        <span className="text-xs">Loading lyrics...</span>
                      </div>
                    ) : lyricsData.synced?.length ? (
                      lyricsData.synced.map((line, idx) => {
                        const isActive = idx === activeLyricIndex;
                        const isPast = idx < activeLyricIndex;
                        return (
                          <div
                            key={idx}
                            ref={isActive ? activeLyricRef : null}
                            onClick={() => {
                              setPosition(line.time);
                              if (mediaElRef.current) mediaElRef.current.currentTime = line.time;
                              if (audioRef.current) audioRef.current.currentTime = line.time;
                            }}
                            className={`cursor-pointer transition-all duration-300 py-2.5 px-4 rounded-2xl ${
                              isActive
                                ? "text-white font-black scale-[1.04] opacity-100 bg-gradient-to-r from-purple-600/30 via-pink-600/25 to-purple-600/30 border border-purple-400/40 shadow-xl shadow-purple-950/60"
                                : isPast
                                ? "text-white/60 font-semibold opacity-60 scale-100"
                                : "text-white/35 font-medium opacity-35 hover:opacity-75"
                            }`}
                            style={{
                              fontFamily: displayFont,
                              fontSize: isActive ? 19 : 15,
                              lineHeight: 1.4,
                              textShadow: isActive ? "0 0 20px rgba(192,132,252,0.85)" : "none",
                            }}
                          >
                            {line.text}
                          </div>
                        );
                      })
                    ) : lyricsData.plain ? (
                      <div className="text-neutral-300 whitespace-pre-line text-sm leading-relaxed font-medium py-3 px-2">
                        {lyricsData.plain}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-neutral-400 gap-2">
                        <Mic2 size={24} className="text-neutral-600 mb-1" />
                        <span className="text-xs font-semibold text-neutral-300">No lyrics available</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Title & Artist */}
              <div className="text-center mt-1">
                <div style={{ fontFamily: displayFont, fontSize: 18, fontWeight: 700, color: colors.text }} className="line-clamp-1">
                  {track?.title || "Nothing playing"}
                </div>
                <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} className="truncate">
                  {track?.artist || ""}
                </div>
              </div>

              {/* Scrubber */}
              <div className="mt-2.5">
                <div {...scrubHandlers} className="py-2 cursor-pointer touch-none">
                  <div className="relative h-1.5 bg-white/20 rounded-full">
                    <div className="h-full bg-white rounded-full" style={{ width: `${progress}%` }} />
                    <div
                      className="absolute top-1/2 w-3.5 h-3.5 -mt-1.5 -ml-1.5 rounded-full bg-white shadow-md"
                      style={{ left: `${progress}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono mt-0.5">
                  <span>{formatTime(shownPosition)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Transport Buttons */}
              <div className="flex items-center justify-between mt-2 px-2">
                <button onClick={() => setShuffle((v) => !v)} className="p-2 bg-transparent border-none cursor-pointer" style={{ color: shuffle ? colors.accentLight : colors.textMuted }}>
                  <Shuffle size={20} />
                </button>
                <button
                  onClick={() => skip(-1)}
                  title="Previous track"
                  aria-label="Previous track"
                  className="p-2 bg-transparent border-none cursor-pointer text-white active:scale-95 transition-transform"
                >
                  <SkipBack size={26} />
                </button>
                <button
                  onClick={toggle}
                  className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center border-none cursor-pointer shadow-xl active:scale-95 transition-transform"
                >
                  {playing ? <Pause size={26} color="#0c0812" /> : <Play size={26} color="#0c0812" style={{ marginLeft: 3 }} />}
                </button>
                <button
                  onClick={() => skip(1)}
                  title="Next track"
                  aria-label="Next track"
                  className="p-2 bg-transparent border-none cursor-pointer text-white active:scale-95 transition-transform"
                >
                  <SkipForward size={26} />
                </button>
                <button onClick={() => setRepeat((v) => !v)} className="p-2 bg-transparent border-none cursor-pointer" style={{ color: repeat ? colors.accentLight : colors.textMuted }}>
                  <Repeat size={20} />
                </button>
              </div>

              {/* Mobile Up Next Bottom Bar (Tap or Swipe Up to reveal queue) */}
              <div className="mt-2.5 pt-2 border-t border-white/10">
                <button
                  onClick={() => setMobileQueueOpen(true)}
                  onTouchStart={(e) => { touchStartYRef.current = e.touches[0].clientY; }}
                  onTouchMove={(e) => {
                    if (!touchStartYRef.current) return;
                    const deltaY = touchStartYRef.current - e.touches[0].clientY;
                    if (deltaY > 15) {
                      setMobileQueueOpen(true);
                      touchStartYRef.current = 0;
                    }
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.06] active:bg-white/15 border border-white/10 text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ListMusic size={16} className="text-purple-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-neutral-200">Up Next ({queue.length || tracks?.length || 0})</span>
                    {queue[1]?.title && (
                      <span className="text-[11px] text-neutral-400 truncate max-w-[140px]">• Next: {queue[1].title}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-purple-400 font-semibold">
                    <span>Swipe up</span>
                    <ChevronUp size={15} />
                  </div>
                </button>
              </div>

              {/* Animated Up Next Slide-Up Bottom Sheet Drawer */}
              {mobileQueueOpen && (
                <div
                  className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
                  onClick={() => setMobileQueueOpen(false)}
                />
              )}
              <div
                onTouchStart={(e) => { touchStartYRef.current = e.touches[0].clientY; }}
                onTouchMove={(e) => {
                  if (!touchStartYRef.current) return;
                  const deltaY = touchStartYRef.current - e.touches[0].clientY;
                  if (deltaY < -25) {
                    setMobileQueueOpen(false);
                    touchStartYRef.current = 0;
                  }
                }}
                className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-neutral-950/95 backdrop-blur-2xl border-t border-white/20 shadow-[0_-20px_60px_rgba(0,0,0,0.95)] flex flex-col transition-transform duration-300 ease-out"
                style={{
                  height: "72vh",
                  transform: mobileQueueOpen ? "translateY(0)" : "translateY(100%)",
                }}
              >
                {/* Drag Handle Bar */}
                <div
                  onClick={() => setMobileQueueOpen(false)}
                  className="w-full pt-3 pb-2 flex flex-col items-center cursor-pointer select-none"
                >
                  <div className="w-12 h-1.5 rounded-full bg-white/30" />
                </div>

                {/* Drawer Header */}
                <div className="flex items-center justify-between px-5 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <ListMusic size={20} className="text-purple-400" />
                    <span style={{ fontFamily: displayFont, fontSize: 17, fontWeight: 700, color: colors.text }}>
                      Up Next ({queue.length || tracks?.length || 0})
                    </span>
                  </div>
                  <button
                    onClick={() => setMobileQueueOpen(false)}
                    className="p-1.5 rounded-full bg-white/10 active:bg-white/20 text-neutral-300 border-none cursor-pointer flex items-center justify-center"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Track List */}
                <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 no-scrollbar">
                  {(queue.length ? queue : tracks || []).map((t, idx) => {
                    const isActive = (t.sourceId || t.id) === (nowPlaying?.sourceId || nowPlaying?.id);
                    return (
                      <button
                        key={t.sourceId || t.id || idx}
                        onClick={() => {
                          openTrack(t);
                          setMobileQueueOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all border ${
                          isActive
                            ? "bg-purple-600/25 border-purple-500/40 text-purple-200 shadow-md shadow-purple-900/30"
                            : "bg-white/[0.03] border-transparent active:bg-white/[0.08] text-neutral-200"
                        }`}
                      >
                        <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-800">
                          {t.artworkUrl ? (
                            <img src={t.artworkUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music size={18} color={colors.textMuted} />
                            </div>
                          )}
                          {isActive && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Play size={16} color="#fff" fill="#fff" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate">{t.title}</div>
                          <div className="text-xs text-neutral-400 truncate mt-0.5">{t.artist}</div>
                        </div>
                        <div className="text-xs text-neutral-500 font-mono">
                          {formatTime(t.durationSec || t.durationSeconds || 0)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Desktop Stage Layout */
            <div className="relative flex-1 min-h-0 flex flex-row gap-10 px-10 pb-6">
              <div className="flex-1 flex flex-col items-center justify-center gap-6 min-h-0">
                {displayMode === "song" ? (
                  <div
                    onClick={toggle}
                    className="rounded-full cursor-pointer overflow-hidden border-[8px] border-neutral-900 shadow-[0_30px_90px_rgba(0,0,0,0.95),0_0_40px_rgba(168,85,247,0.25)] relative flex items-center justify-center select-none"
                    style={{
                      height: "min(420px, 48vh)",
                      aspectRatio: "1 / 1",
                      animation: playing ? `vinyl-spin ${Math.max(1.5, 20 / tempo)}s linear infinite` : "none",
                      background: track?.artworkUrl
                        ? `radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.3) 100%), url(${track.artworkUrl}) center/cover no-repeat`
                        : colors.bgElevated,
                    }}
                  >
                    {/* Concentric Vinyl Grooves Effect */}
                    <div
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{
                        background: `repeating-radial-gradient(circle at center, transparent 0px, transparent 4px, rgba(255,255,255,0.035) 5px, transparent 6px)`,
                        mixBlendMode: "overlay",
                      }}
                    />

                    {/* Vinyl Light Gloss Reflection */}
                    <div
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{
                        background: `linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 45%, rgba(255,255,255,0.06) 55%, transparent 100%)`,
                      }}
                    />

                    {/* Center Vinyl Label & Spindle Ring */}
                    <div className="relative w-24 h-24 rounded-full bg-neutral-950/90 backdrop-blur-md border-2 border-white/25 flex items-center justify-center shadow-2xl">
                      <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center bg-black/40">
                        <div className="w-7 h-7 rounded-full bg-neutral-900 border-2 border-neutral-600 shadow-inner flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-white/90" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : displayMode === "lyrics" ? (
                  <div
                    ref={desktopLyricsContainerRef}
                    className="w-full h-[min(420px,48vh)] overflow-y-auto px-6 py-6 flex flex-col gap-6 text-center bg-white/[0.03] rounded-3xl border border-white/10 shadow-2xl no-scrollbar select-none"
                  >
                    {lyricsData.loading ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-20 text-neutral-400 gap-3">
                        <Sparkles size={32} className="animate-spin text-purple-400" />
                        <span className="text-sm font-medium">Fetching synced lyrics...</span>
                      </div>
                    ) : lyricsData.synced?.length ? (
                      lyricsData.synced.map((line, idx) => {
                        const isActive = idx === activeLyricIndex;
                        const isPast = idx < activeLyricIndex;
                        return (
                          <div
                            key={idx}
                            ref={isActive ? activeLyricRef : null}
                            onClick={() => {
                              setPosition(line.time);
                              if (mediaElRef.current) mediaElRef.current.currentTime = line.time;
                              if (audioRef.current) audioRef.current.currentTime = line.time;
                            }}
                            className={`cursor-pointer transition-all duration-300 py-3 px-6 rounded-2xl select-none ${
                              isActive
                                ? "text-white font-black scale-[1.04] opacity-100 bg-gradient-to-r from-purple-600/30 via-pink-600/25 to-purple-600/30 border border-purple-400/40 shadow-2xl shadow-purple-950/70"
                                : isPast
                                ? "text-white/60 font-semibold opacity-60 hover:opacity-100 hover:text-white"
                                : "text-white/35 font-medium opacity-35 hover:opacity-80 hover:text-white"
                            }`}
                            style={{
                              fontFamily: displayFont,
                              fontSize: isActive ? 27 : 21,
                              lineHeight: 1.4,
                              textShadow: isActive ? "0 0 28px rgba(192,132,252,0.9)" : "none",
                            }}
                          >
                            {line.text}
                          </div>
                        );
                      })
                    ) : lyricsData.plain ? (
                      <div className="text-neutral-300 whitespace-pre-line text-lg leading-loose font-medium py-6 px-4">
                        {lyricsData.plain}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center py-20 text-neutral-400 gap-2">
                        <Mic2 size={40} className="text-neutral-600 mb-2" />
                        <span className="text-base font-semibold text-neutral-300">No lyrics available</span>
                        <span className="text-xs text-neutral-500">Lyrics couldn't be found for this track.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ height: "min(420px, 48vh)", width: "100%" }} />
                )}

                <div className="text-center" style={{ maxWidth: 540 }}>
                  <div style={{ fontFamily: displayFont, fontSize: 26, fontWeight: 700, color: colors.text }} className="line-clamp-2">
                    {track?.title || "Nothing playing"}
                  </div>
                  <div style={{ fontSize: 16, color: colors.textMuted, marginTop: 6 }} className="truncate">
                    {track?.artist || ""}
                  </div>
                </div>
              </div>

              {/* Up Next List */}
              <div className="w-[360px] flex-shrink-0 flex flex-col min-h-0 bg-white/[0.04] p-5 rounded-2xl border border-white/10">
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.textMuted, marginBottom: 12 }}>
                  Up Next ({queue.length} Tracks)
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                  {(queue.length ? queue : tracks || []).map(trackRow)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Sticky Player Bar (Only visible when a song has been chosen) */}
      {nowPlaying && (
        <div
          className="fixed left-0 right-0 flex items-center gap-4 px-4 md:px-8"
          style={{
            bottom: narrow ? NAV_HEIGHT : 0,
            transform: !narrow || barVisible ? "translateY(0)" : `translateY(${BAR_HEIGHT + 10}px)`,
            transition: narrow ? "transform 260ms cubic-bezier(.32,.72,0,1)" : "none",
            height: BAR_HEIGHT,
            background: "rgba(18,12,28,0.94)",
            backdropFilter: "blur(16px)",
            borderTop: `1px solid ${colors.ring}`,
            zIndex: 58,
          }}
        >
          {/* Scrubber on top edge */}
          <div className="absolute left-0 right-0" {...scrubHandlers} style={{ top: -4, height: 8, cursor: duration ? "pointer" : "default", touchAction: "none" }}>
            <div style={{ height: 3, background: "rgba(255,255,255,0.15)" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: colors.accent }} />
            </div>
          </div>

          {/* Playback & Track Info (Responsive) */}
          {narrow ? (
            /* Mobile Mini-Player Bar Layout (Spotify / YouTube Music Style) */
            <div className="flex items-center justify-between w-full gap-2 min-w-0">
              {/* Tappable Track Info (Expands full stage) */}
              <button
                onClick={() => setExpanded(true)}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left bg-transparent border-none cursor-pointer p-0"
              >
                {track?.artworkUrl ? (
                  <img src={track.artworkUrl} alt="" width={42} height={42} className="rounded-lg object-cover flex-shrink-0 shadow" />
                ) : (
                  <div className="w-[42px] h-[42px] rounded-lg bg-neutral-800 flex-shrink-0 flex items-center justify-center">
                    <Music size={18} color={colors.textMuted} />
                  </div>
                )}
                <div className="min-w-0 flex-1 pr-1">
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }} className="truncate">
                    {track?.title || "Nothing playing"}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }} className="truncate">
                    {buffering ? "Buffering…" : track?.artist || "Pick a song to play"}
                  </div>
                </div>
              </button>

              {/* Mobile Playback Controls */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => skip(-1)}
                  title="Previous track"
                  aria-label="Previous track"
                  className="bg-transparent border-none cursor-pointer text-neutral-400 hover:text-white p-1.5 active:scale-95 transition-transform"
                >
                  <SkipBack size={20} />
                </button>
                <button
                  onClick={toggle}
                  aria-label={playing ? "Pause" : "Play"}
                  className="w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer shadow-lg active:scale-95 transition-transform"
                  style={{ background: colors.accent }}
                >
                  {playing ? <Pause size={17} color="#fff" /> : <Play size={17} color="#fff" style={{ marginLeft: 2 }} />}
                </button>
                <button
                  onClick={() => skip(1)}
                  title="Next track"
                  aria-label="Next track"
                  className="bg-transparent border-none cursor-pointer text-neutral-400 hover:text-white p-1.5 active:scale-95 transition-transform"
                >
                  <SkipForward size={20} />
                </button>
              </div>
            </div>
          ) : (
            /* Desktop Bottom Player Bar */
            <>
              {/* Transport Buttons */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={() => skip(-1)}
                  title="Previous track (←)"
                  aria-label="Previous track"
                  className="bg-transparent border-none cursor-pointer text-neutral-400 hover:text-white p-0 hover:scale-110 transition-transform"
                >
                  <SkipBack size={21} />
                </button>
                <button
                  onClick={toggle}
                  aria-label={playing ? "Pause" : "Play"}
                  className="w-10 h-10 rounded-full flex items-center justify-center border-none cursor-pointer hover:scale-105 transition-transform"
                  style={{ background: colors.accent }}
                >
                  {playing ? <Pause size={19} color="#fff" /> : <Play size={19} color="#fff" style={{ marginLeft: 2 }} />}
                </button>
                <button
                  onClick={() => skip(1)}
                  title="Next track (→)"
                  aria-label="Next track"
                  className="bg-transparent border-none cursor-pointer text-neutral-400 hover:text-white p-0 hover:scale-110 transition-transform"
                >
                  <SkipForward size={21} />
                </button>
                <span className="hidden sm:block text-xs text-neutral-400 font-mono ml-1">
                  {formatTime(shownPosition)} / {formatTime(duration)}
                </span>
              </div>

              {/* Current Track Info */}
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-3 min-w-0 flex-1 text-left bg-transparent border-none cursor-pointer p-0"
              >
                {track?.artworkUrl ? (
                  <img src={track.artworkUrl} alt="" width={46} height={46} className="rounded object-cover flex-shrink-0 shadow" />
                ) : (
                  <div className="w-[46px] h-[46px] rounded bg-neutral-800 flex-shrink-0 flex items-center justify-center">
                    <Music size={20} color={colors.textMuted} />
                  </div>
                )}
                <span className="min-w-0">
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: colors.text }} className="truncate">
                    {track?.title || "Nothing playing"}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: colors.textMuted, marginTop: 2 }} className="truncate">
                    {buffering ? "Buffering…" : track?.artist || "Pick a song to play"}
                  </span>
                </span>
              </button>

              {/* Extra Action Controls */}
              <div className="flex items-center gap-4 flex-shrink-0">
                <button
                  onClick={() => toggleLike(track)}
                  aria-label="Like"
                  className="hidden sm:flex bg-transparent border-none cursor-pointer"
                  style={{ color: isLiked(track) ? colors.accentLight : colors.textMuted }}
                >
                  <ThumbsUp size={18} fill={isLiked(track) ? colors.accentLight : "none"} />
                </button>

                {/* High-visibility filled volume slider */}
                <div className="hidden sm:flex items-center gap-2 group/vol">
                  <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="bg-transparent border-none cursor-pointer text-neutral-400 hover:text-white p-0">
                    {muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
                  </button>
                  <div className="relative flex items-center w-24">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={muted ? 0 : volume}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setVolume(v);
                        if (mediaElRef.current) mediaElRef.current.volume = v;
                        if (audioRef.current) audioRef.current.volume = v;
                        if (muted) setMuted(false);
                      }}
                      className="w-full h-1.5 rounded-full cursor-pointer appearance-none bg-white/20 accent-purple-500"
                      style={{
                        background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.25) ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.25) 100%)`,
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400 w-7 text-right">
                    {muted ? 0 : Math.round(volume * 100)}%
                  </span>
                </div>

                <button
                  onClick={openRates}
                  aria-label="Tempo and Pitch"
                  className="flex items-center gap-1 bg-transparent border-none cursor-pointer text-xs font-bold"
                  style={{ color: ratesTouched ? colors.accentLight : colors.textMuted }}
                >
                  <Gauge size={17} />
                  <span className="font-mono">{tempo.toFixed(2)}x</span>
                </button>

                <button onClick={() => setRepeat((v) => !v)} className="hidden sm:flex bg-transparent border-none cursor-pointer" style={{ color: repeat ? colors.accentLight : colors.textMuted }}>
                  <Repeat size={18} />
                </button>
                <button onClick={() => setShuffle((v) => !v)} className="hidden sm:flex bg-transparent border-none cursor-pointer" style={{ color: shuffle ? colors.accentLight : colors.textMuted }}>
                  <Shuffle size={18} />
                </button>
                <button onClick={() => setExpanded((v) => !v)} className="bg-transparent border-none cursor-pointer text-neutral-400 p-0">
                  {expanded ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (Explore centered) */}
      {narrow && (
        <div
          className="fixed left-0 right-0 bottom-0 flex items-stretch"
          style={{ height: NAV_HEIGHT, background: colors.bg, borderTop: `1px solid ${colors.ring}`, zIndex: 59 }}
        >
          {[
            ["home", "Home", Home],
            ["history", "History", History],
            ["explore", "Explore", Compass],
            ["library", "Library", Library],
          ].map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => { setView(key); setQuery(""); setMobileSearch(false); setExpanded(false); }}
              className="flex-1 flex flex-col items-center justify-center gap-1 bg-transparent border-none cursor-pointer"
              style={{
                color: view === key ? colors.text : colors.textMuted,
                fontFamily: bodyFont, fontSize: 10.5, fontWeight: view === key ? 700 : 500,
              }}
            >
              <Icon size={key === "explore" ? 22 : 19} color={view === key ? colors.accentLight : colors.textMuted} />
              {label}
            </button>
          ))}
          <Link
            to="/"
            onClick={() => setExpanded(false)}
            className="flex-1 flex flex-col items-center justify-center gap-1 bg-transparent border-none cursor-pointer text-decoration-none"
            style={{
              color: colors.textMuted,
              fontFamily: bodyFont, fontSize: 10.5, fontWeight: 500, textDecoration: "none",
            }}
          >
            <Film size={19} color={colors.textMuted} />
            Movies
          </Link>
        </div>
      )}

      {/* Premium Glassmorphic FX Drawer — right-bottom anchored, slide-up */}
      {ratesOpen && (
        <>
          <div
            onClick={() => closeDrawer()}
            className="fixed inset-0 z-[70]"
            style={{ background: "transparent" }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              right: narrow ? 12 : 20,
              bottom: narrow ? NAV_HEIGHT + 8 : BAR_HEIGHT + 12,
              width: narrow ? "calc(100vw - 24px)" : 340,
              maxWidth: 360,
              background: "rgba(12, 12, 18, 0.72)",
              backdropFilter: "blur(32px) saturate(180%)",
              WebkitBackdropFilter: "blur(32px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 18,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
              zIndex: 71,
              padding: "14px 16px 16px",
              animation: drawerClosing
                ? "onionDrawerDown 200ms cubic-bezier(0.4, 0, 1, 1) forwards"
                : "onionDrawerUp 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal size={13} style={{ color: "rgba(255,255,255,0.5)" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Sound FX
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={resetRates}
                  style={{ padding: "3px 8px", fontSize: 11, fontWeight: 500, borderRadius: 8, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all 0.15s" }}
                >
                  <RotateCcw size={10} /> Reset
                </button>
                <button
                  onClick={() => closeDrawer()}
                  style={{ padding: 4, borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", transition: "all 0.15s" }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Sound FX Presets */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
              {FX_PRESETS.map((preset) => {
                const isSelected = fx.preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      updateFX({
                        tempo: preset.tempo,
                        pitch: preset.pitch,
                        reverb: preset.reverb,
                        unhook: preset.unhook,
                        preset: preset.id,
                      });
                    }}
                    style={{
                      padding: "6px 4px",
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: isSelected ? 600 : 500,
                      cursor: "pointer",
                      border: "none",
                      transition: "all 0.15s",
                      background: isSelected ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.06)",
                      color: isSelected ? "#0a0a0f" : "rgba(255,255,255,0.65)",
                      boxShadow: isSelected ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Sliders */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Tempo */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>Tempo</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.95)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fx.tempo.toFixed(2)}x</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => updateFX({ tempo: clampFXRate(fx.tempo - FX_RATE_STEP) })}
                    style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "transform 0.1s" }}
                    className="active:scale-90"
                    aria-label="Decrease tempo"
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    type="range"
                    min={FX_RATE_MIN}
                    max={FX_RATE_MAX}
                    step={0.01}
                    value={fx.tempo}
                    onChange={(e) => updateFX({ tempo: clampFXRate(e.target.value) })}
                    onInput={(e) => updateFX({ tempo: clampFXRate(e.target.value) })}
                    className="onion-rate flex-1"
                    style={{
                      background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${((fx.tempo - FX_RATE_MIN) / (FX_RATE_MAX - FX_RATE_MIN)) * 100}%, rgba(255,255,255,0.18) ${((fx.tempo - FX_RATE_MIN) / (FX_RATE_MAX - FX_RATE_MIN)) * 100}%, rgba(255,255,255,0.18) 100%)`,
                    }}
                  />
                  <button
                    onClick={() => updateFX({ tempo: clampFXRate(fx.tempo + FX_RATE_STEP) })}
                    style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "transform 0.1s" }}
                    className="active:scale-90"
                    aria-label="Increase tempo"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {/* Pitch */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>Pitch</span>
                    <span style={{ fontSize: 10.5, padding: "2px 6px", borderRadius: 6, background: "rgba(168,85,247,0.2)", color: "#d8b4fe", border: "1px solid rgba(168,85,247,0.3)", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{semitonesFromPitch(fx.pitch)}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.95)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{Math.round(fx.pitch * 100)}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => updateFX({ pitch: clampFXRate(fx.pitch - FX_RATE_STEP) })}
                    style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "transform 0.1s" }}
                    className="active:scale-90"
                    aria-label="Decrease pitch"
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    type="range"
                    min={FX_RATE_MIN}
                    max={FX_RATE_MAX}
                    step={0.01}
                    value={fx.pitch}
                    onChange={(e) => updateFX({ pitch: clampFXRate(e.target.value) })}
                    onInput={(e) => updateFX({ pitch: clampFXRate(e.target.value) })}
                    className="onion-rate flex-1"
                    style={{
                      background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${((fx.pitch - FX_RATE_MIN) / (FX_RATE_MAX - FX_RATE_MIN)) * 100}%, rgba(255,255,255,0.18) ${((fx.pitch - FX_RATE_MIN) / (FX_RATE_MAX - FX_RATE_MIN)) * 100}%, rgba(255,255,255,0.18) 100%)`,
                    }}
                  />
                  <button
                    onClick={() => updateFX({ pitch: clampFXRate(fx.pitch + FX_RATE_STEP) })}
                    style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "transform 0.1s" }}
                    className="active:scale-90"
                    aria-label="Increase pitch"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {/* Reverb */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>Reverb & Ambience</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.95)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{Math.round(fx.reverb * 100)}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => updateFX({ reverb: Math.max(0, Number((fx.reverb - 0.05).toFixed(2))) })}
                    style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "transform 0.1s" }}
                    className="active:scale-90"
                    aria-label="Decrease reverb"
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(fx.reverb * 100)}
                    onChange={(e) => updateFX({ reverb: Number(e.target.value) / 100 })}
                    onInput={(e) => updateFX({ reverb: Number(e.target.value) / 100 })}
                    className="onion-rate flex-1"
                    style={{
                      background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${fx.reverb * 100}%, rgba(255,255,255,0.18) ${fx.reverb * 100}%, rgba(255,255,255,0.18) 100%)`,
                    }}
                  />
                  <button
                    onClick={() => updateFX({ reverb: Math.min(1, Number((fx.reverb + 0.05).toFixed(2))) })}
                    style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "transform 0.1s" }}
                    className="active:scale-90"
                    aria-label="Increase reverb"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {/* Unhook Toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {fx.unhook ? <Unlink size={12} style={{ color: "rgba(255,255,255,0.5)" }} /> : <Link2 size={12} style={{ color: "rgba(255,255,255,0.3)" }} />}
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>Unhook Pitch</span>
                </div>
                <button
                  onClick={() => updateFX({ unhook: !fx.unhook })}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    background: fx.unhook ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                    color: fx.unhook ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    letterSpacing: "0.06em",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: fx.unhook ? "#e2e8f0" : "rgba(255,255,255,0.2)", display: "inline-block" }} />
                  {fx.unhook ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}