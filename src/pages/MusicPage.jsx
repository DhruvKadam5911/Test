import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Play, Pause, SkipBack, SkipForward, Search, X, Music, Home, Compass,
  Library, Shuffle, Repeat, Volume2, VolumeX, ChevronDown, ChevronUp,
  Film, History, ArrowLeft, Clock, TrendingUp, Sparkles, ArrowUpLeft,
  ThumbsUp, ThumbsDown, Gauge, Link2, Unlink, Minus, Plus, Video, Disc3, Radio,
} from "lucide-react";
import { colors, bodyFont, displayFont } from "../theme";
import OnionMark from "../components/shared/OnionMark";
import BrandWord from "../components/shared/BrandWord";
import ExploreView from "../components/music/ExploreView";
import api from "../api/client";

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

// Rate controls
const RATE_MIN = 0.1;
const RATE_MAX = 3.0;
const RATE_STEPS = [
  ["1%", 0.01],
  ["5%", 0.05],
  ["10%", 0.1],
  ["25%", 0.25],
  ["100%", 1.0],
];

const YT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const clampRate = (v) =>
  Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(Number(v) * 100) / 100));

const nearestRate = (list, value) =>
  list.reduce((best, r) => (Math.abs(r - value) < Math.abs(best - value) ? r : best), list[0]);

const sameRate = (a, b) => Math.abs(a - b) < 0.005;

/* Load YouTube Iframe API once */
let apiPromise = null;
function loadYoutubeApi() {
  if (typeof window !== "undefined" && window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    if (!document.querySelector(`script[src="${IFRAME_API}"]`)) {
      const script = document.createElement("script");
      script.src = IFRAME_API;
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
    dataset: el.dataset,
    get loop() {
      return el.loop;
    },
    set loop(value) {
      el.loop = value;
    },
    play: () => el.play(),
    pause: () => el.pause(),
    load: () => el.load(),
    setSource(url, { autoplay }) {
      el.src = url;
      el.load();
      if (autoplay) el.play().catch(() => {});
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
    setRates(tempo, pitch) {
      const hooked = sameRate(pitch, tempo);
      const preserve = !hooked;
      try {
        el.playbackRate = tempo;
        el.preservesPitch = preserve;
        if ("mozPreservesPitch" in el) el.mozPreservesPitch = preserve;
        if ("webkitPreservesPitch" in el) el.webkitPreservesPitch = preserve;
      } catch (e) {}
      return { tempo, pitch };
    },
  };
}

/* YouTube IFrame Player Engine */
function youtubeEngine(player) {
  return {
    kind: "youtube",
    canPitch: true,
    snapsTempo: true,
    dataset: {},
    loop: false,
    get playbackRate() {
      return player?.getPlaybackRate?.() || 1;
    },
    get rateList() {
      const list = player?.getAvailablePlaybackRates?.();
      return list?.length ? list : YT_RATES;
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
    setSource(videoId, { autoplay }) {
      try {
        if (autoplay) player?.loadVideoById?.(videoId);
        else player?.cueVideoById?.(videoId);
      } catch (err) {
        console.warn("yt setSource error:", err);
      }
    },
    get paused() {
      return player?.getPlayerState?.() !== 1;
    },
    get currentTime() {
      return player?.getCurrentTime?.() || 0;
    },
    set currentTime(to) {
      player?.seekTo?.(to, true);
    },
    get duration() {
      return player?.getDuration?.() || 0;
    },
    get muted() {
      return Boolean(player?.isMuted?.());
    },
    set muted(value) {
      if (value) player?.mute?.();
      else player?.unMute?.();
    },
    get volume() {
      return (player?.getVolume?.() ?? 100) / 100;
    },
    set volume(value) {
      player?.setVolume?.(Math.round(value * 100));
    },
    setRates(tempo, pitch) {
      const applied = nearestRate(this.rateList, tempo);
      try {
        player?.setPlaybackRate?.(applied);
      } catch (e) {
        console.warn("yt setRates error:", e);
      }
      return { tempo: applied, pitch };
    },
  };
}

function applyRates(engine, tempo, pitch) {
  if (!engine?.setRates) return null;
  try {
    return engine.setRates(tempo, pitch);
  } catch (err) {
    console.warn("setRates failed:", err);
    return null;
  }
}

function sourceOf(track) {
  if (!track) return "";
  return track.streamUrl || track.sourceId || track.id || "";
}

const STAGE_MS = 340;
const BAR_REVEAL_AT = 120;
const SHEET_PEEK = 66;

const RAIL_WIDTH = 232;
const BAR_HEIGHT = 76;
const NAV_HEIGHT = 58;
const NARROW = "(max-width: 767px)";
const SEEK_STEP = 10;

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
  } catch {
    // storage fallback
  }
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

export default function MusicPage() {
  const [view, setView] = useState("home");
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState("songs");
  const [searching, setSearching] = useState(false);
  const [tracks, setTracks] = useState(null);
  const [albums, setAlbums] = useState([]);
  const [explore, setExplore] = useState({ albums: [], top: [] });
  const [forYou, setForYou] = useState([]);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [queue, setQueue] = useState([]);
  const [recent, setRecent] = useState(() => readStorage(RECENT_KEY));
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

  const [tempo, setTempo] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [unhook, setUnhook] = useState(false);
  const [rateStep, setRateStep] = useState(0.05);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [ratesBefore, setRatesBefore] = useState(null);
  const [rateNote, setRateNote] = useState(null);

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  const [expanded, setExpanded] = useState(false);
  const [stageMounted, setStageMounted] = useState(false);
  const [stageIn, setStageIn] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(NARROW).matches
  );
  const [mobileSearch, setMobileSearch] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searches, setSearches] = useState(() => readStorage(SEARCHES_KEY));

  useEffect(() => {
    const q = window.matchMedia?.(NARROW);
    if (!q) return;
    const onChange = (e) => setNarrow(e.matches);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);

  const audioRef = useRef(null);
  const mediaEngineRef = useRef(null);
  const youtubeEngineRef = useRef(null);
  const mediaElRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytContainerRef = useRef(null);
  const tracksRef = useRef(null);
  const queueRef = useRef([]);
  const actionsRef = useRef({});

  const searchActive = query.trim().length >= 2;
  const searchScreen = (narrow ? mobileSearch : searchFocused) && !searchActive;
  const track = nowPlaying;
  tracksRef.current = tracks;
  queueRef.current = queue;

  const isYouTubeTrack = !track?.streamUrl;
  const canPitch = true;

  const selectEngine = (currentTrack = track) => {
    if (currentTrack?.streamUrl) {
      if (mediaEngineRef.current) audioRef.current = mediaEngineRef.current;
    } else {
      if (youtubeEngineRef.current) audioRef.current = youtubeEngineRef.current;
      else if (mediaEngineRef.current) audioRef.current = mediaEngineRef.current;
    }
    return audioRef.current;
  };

  const switchDisplayMode = (newMode) => {
    setDisplayMode(newMode);
  };

  /* Initialize HTML5 Media Engine */
  useEffect(() => {
    const el = mediaElRef.current;
    if (!el) return;
    mediaEngineRef.current = mediaEngine(el);
    const handlers = [
      ["play", () => { setPlaying(true); setBuffering(false); }],
      ["playing", () => { setPlaying(true); setBuffering(false); }],
      ["pause", () => setPlaying(false)],
      ["waiting", () => setBuffering(true)],
      ["loadedmetadata", () => setDuration(el.duration || 0)],
      ["durationchange", () => setDuration(el.duration || 0)],
      ["ended", () => actionsRef.current.ended?.()],
      ["error", () => {
        setBuffering(false);
        setError("Playback failed for this stream.");
      }],
    ];
    for (const [event, handler] of handlers) el.addEventListener(event, handler);
    return () => {
      for (const [event, handler] of handlers) el.removeEventListener(event, handler);
    };
  }, []);

  /* Initialize YouTube IFrame Player Engine */
  useEffect(() => {
    let unmounted = false;
    loadYoutubeApi().then((YT) => {
      if (unmounted || ytPlayerRef.current || !document.getElementById("onion-yt-host")) return;
      try {
        const player = new YT.Player("onion-yt-host", {
          height: "100%",
          width: "100%",
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3,
            fs: 1,
          },
          events: {
            onReady: (event) => {
              ytPlayerRef.current = event.target;
              youtubeEngineRef.current = youtubeEngine(event.target);
              if (!audioRef.current && (!nowPlaying || !nowPlaying.streamUrl)) {
                audioRef.current = youtubeEngineRef.current;
              }
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) {
                setPlaying(true);
                setBuffering(false);
                const d = ytPlayerRef.current?.getDuration?.();
                if (d) setDuration(d);
              } else if (event.data === YT.PlayerState.PAUSED) {
                setPlaying(false);
              } else if (event.data === YT.PlayerState.BUFFERING) {
                setBuffering(true);
              } else if (event.data === YT.PlayerState.ENDED) {
                actionsRef.current.ended?.();
              }
            },
            onError: (event) => {
              console.warn("YouTube player error:", event.data);
              setBuffering(false);
            },
          },
        });
      } catch (err) {
        console.error("Failed to init YouTube player:", err);
      }
    });

    return () => {
      unmounted = true;
    };
  }, []);

  /* Fetch initial tracks */
  const loadTracks = () => {
    setError(null);
    setTracks(null);
    api
      .get("/music/tracks?limit=50")
      .then((data) => {
        setTracks(data);
        const last = readStorage(RECENT_KEY)[0];
        setNowPlaying(last || data[0] || null);
        setQueue(last ? [last, ...data] : data);
      })
      .catch((err) => {
        console.error("fetchTracks error:", err);
        setError(err.message || "Unable to connect to backend server. Please verify port 5000 is active.");
        setTracks([]);
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
    ]).then(([albums, top]) => {
      if (!cancelled) setExplore({ albums, top });
    });
    return () => {
      cancelled = true;
    };
  }, [view, explore.albums.length, explore.top.length]);

  /* Related songs for seed */
  const seedTrack = recent[0];
  const seedId = seedTrack?.sourceId;
  useEffect(() => {
    const seed = seedTrack;
    if (!seed?.artist && !seed?.sourceId) return;
    let cancelled = false;
    api
      .get(
        `/music/related?title=${encodeURIComponent(seed.title || "")}` +
          `&artist=${encodeURIComponent(seed.artist || "")}&exclude=${encodeURIComponent(seed.sourceId || "")}&limit=12`
      )
      .then((data) => {
        if (!cancelled && data.length) setForYou(data);
      })
      .catch((err) => console.error("forYou error:", err));
    return () => {
      cancelled = true;
    };
  }, [seedId]);

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
          const updated = [q, ...searches.filter((t) => t.toLowerCase() !== q.toLowerCase())].slice(0, 8);
          setSearches(updated);
          writeStorage(SEARCHES_KEY, updated);
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

  /* Synchronize track load */
  useEffect(() => {
    if (!track) return;
    const audio = selectEngine(track);
    if (!audio) return;
    const source = sourceOf(track);
    if (!source) return;

    if (audio.dataset.sourceId !== String(source)) {
      audio.dataset.sourceId = String(source);
      audio.setSource(source, { autoplay });
      if (!sameRate(tempo, 1) || !sameRate(pitch, 1)) {
        applyRates(audio, tempo, audio.canPitch ? pitch : 1);
      }
    }
    if (autoplay && audio.paused) {
      audio.play()?.catch?.(() => {});
    }
  }, [track?.sourceId, track?.streamUrl, autoplay]);

  /* Record history */
  useEffect(() => {
    if (!track || !autoplay) return;
    const filtered = [track, ...recent.filter((t) => (t.sourceId || t.id) !== (track.sourceId || track.id))].slice(0, 20);
    setRecent(filtered);
    writeStorage(RECENT_KEY, filtered);
  }, [track?.sourceId, autoplay]);

  /* Loop */
  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = repeat;
  }, [repeat]);

  /* Progress ticker */
  useEffect(() => {
    const timer = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const cur = audio.currentTime;
      const dur = audio.duration;
      if (typeof cur === "number") setPosition(cur);
      if (typeof dur === "number" && dur > 0) setDuration(dur);
    }, 350);
    return () => clearInterval(timer);
  }, []);

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
      ["pause", () => audioRef.current?.pause()],
      ["stop", () => audioRef.current?.pause()],
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
  }, [track?.sourceId, track?.title, track?.artist, track?.artworkUrl, duration]);

  /* MediaSession position state */
  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    session.playbackState = playing ? "playing" : "paused";
    try {
      if (duration > 0 && typeof session.setPositionState === "function") {
        session.setPositionState({
          duration,
          position: Math.min(position, duration),
          playbackRate: audioRef.current?.playbackRate || 1,
        });
      }
    } catch {}
  }, [playing, position, duration]);

  /* Global Keyboard Shortcuts */
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const audio = audioRef.current;
      if (!audio) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          actionsRef.current.toggle?.();
          break;
        case "ArrowUp":
          e.preventDefault();
          audio.volume = Math.min(1, (audio.volume || 0) + 0.1);
          setVolume(audio.volume);
          if (audio.muted) {
            audio.muted = false;
            setMuted(false);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          audio.volume = Math.max(0, (audio.volume || 0) - 0.1);
          setVolume(audio.volume);
          break;
        case "ArrowRight":
          e.preventDefault();
          actionsRef.current.skip?.(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          actionsRef.current.skip?.(-1);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    setSheetOpen(false);
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
  const play = (t) => {
    setAutoplay(true);
    setNowPlaying(t);
    setQueue([t]);

    const audio = selectEngine(t);
    const source = sourceOf(t);
    if (audio && source) {
      if (audio.dataset.sourceId !== String(source)) {
        audio.dataset.sourceId = String(source);
        audio.setSource(source, { autoplay: true });
        if (!sameRate(tempo, 1) || !sameRate(pitch, 1)) {
          applyRates(audio, tempo, audio.canPitch ? pitch : 1);
        }
      } else {
        audio.play();
      }
    }

    // Dynamic queue recommendations
    api
      .get(
        `/music/related?title=${encodeURIComponent(t.title || "")}` +
          `&artist=${encodeURIComponent(t.artist || "")}&exclude=${encodeURIComponent(t.sourceId || "")}`
      )
      .then((related) => {
        if (related && related.length) setQueue([t, ...related]);
      })
      .catch(() => {
        setQueue([t, ...(tracksRef.current || []).filter((x) => (x.sourceId || x.id) !== (t.sourceId || t.id))]);
      });
  };

  const resume = () => {
    const audio = selectEngine();
    if (!audio) return;
    setAutoplay(true);
    audio.play?.();
  };

  const toggle = () => {
    const audio = selectEngine();
    if (!audio) return;
    if (audio.paused) resume();
    else audio.pause?.();
  };

  const skip = (delta) => {
    const list = queueRef.current?.length ? queueRef.current : tracksRef.current;
    if (!list?.length) return;
    setAutoplay(true);
    if (shuffle && delta > 0) {
      const randomTrack = list[Math.floor(Math.random() * list.length)];
      play(randomTrack);
      return;
    }
    const curId = nowPlaying?.sourceId || nowPlaying?.id;
    const i = list.findIndex((t) => (t.sourceId || t.id) === curId);
    const nextIdx = Math.min(list.length - 1, Math.max(0, i + delta));
    play(list[nextIdx]);
  };

  const onEnded = () => {
    const list = queueRef.current?.length ? queueRef.current : tracksRef.current;
    if (!list?.length) return;
    setAutoplay(true);
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
  };

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
    const audio = audioRef.current;
    const to = duration ? ratioFrom(event, event.currentTarget) * duration : 0;
    if (audio && duration) {
      audio.currentTime = to;
      setPosition(to);
    }
    setScrubbing(null);
  };

  const scrubHandlers = {
    onPointerDown: scrubStart,
    onPointerMove: scrubMove,
    onPointerUp: scrubEnd,
    onPointerCancel: scrubEnd,
  };

  /* Tempo / Pitch */
  const commitRates = (nextTempo, nextPitch) => {
    const audio = audioRef.current;
    const wantTempo = clampRate(nextTempo);
    const wantPitch = clampRate(nextPitch);

    setTempo(wantTempo);
    setPitch(wantPitch);

    if (audio?.setRates) {
      try {
        audio.setRates(wantTempo, wantPitch);
      } catch (e) {
        console.warn("setRates error:", e);
      }
    }
  };

  const onTempoChange = (value) => {
    const nextVal = clampRate(value);
    if (!unhook) {
      return commitRates(nextVal, nextVal);
    }
    return commitRates(nextVal, pitch);
  };

  const onPitchChange = (value) => {
    const nextVal = clampRate(value);
    if (!unhook) {
      return commitRates(nextVal, nextVal);
    }
    return commitRates(tempo, nextVal);
  };

  const onUnhookChange = (on) => {
    setUnhook(on);
    if (!on) {
      commitRates(tempo, tempo);
    }
  };

  const openRates = () => {
    setRatesBefore({ tempo, pitch, unhook });
    setRateNote(
      isYouTubeTrack
        ? "YouTube Player active: Speed adjustments (0.25x – 2.0x) apply to YouTube video streams. Key pitch correction is managed by YouTube's player."
        : "Direct Audio active: Pitch and Tempo adjust via Web Audio / HTML5 audio rate engine."
    );
    setRatesOpen(true);
  };

  const cancelRates = () => {
    if (ratesBefore) {
      setUnhook(ratesBefore.unhook);
      commitRates(ratesBefore.tempo, ratesBefore.pitch);
    }
    setRateNote(null);
    setRatesOpen(false);
  };

  const resetRates = () => {
    setUnhook(false);
    commitRates(1, 1);
  };

  const setVolumeLevel = (level) => {
    const audio = audioRef.current;
    setVolume(level);
    if (!audio) return;
    audio.volume = level;
    if (level > 0 && audio.muted) {
      audio.muted = false;
      setMuted(false);
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
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
  const ratesTouched = !sameRate(tempo, 1) || !sameRate(pitch, 1);

  const cardRow = (title, items) =>
    items && items.length > 0 && (
      <div className="mb-10">
        <div style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 600, color: colors.text, marginBottom: 14 }}>
          {title}
        </div>
        <div className="flex gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: "none" }}>
          {items.map((t) => (
            <button
              key={t.sourceId || t.id}
              onClick={() => openTrack(t)}
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
                <span
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                >
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

  const railItem = (key, label, Icon) => (
    <button
      key={key}
      onClick={() => { setView(key); setQuery(""); }}
      className="flex items-center gap-4 w-full rounded-lg transition-all"
      style={{
        background: view === key ? "rgba(255,255,255,0.12)" : "transparent",
        border: "none", cursor: "pointer", padding: "12px 16px",
        color: view === key ? colors.text : colors.textMuted,
        fontFamily: bodyFont, fontSize: 14.5, fontWeight: view === key ? 700 : 500,
      }}
    >
      <Icon size={20} color={view === key ? colors.accentLight : colors.textMuted} />
      {label}
    </button>
  );

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont, color: colors.text }}>
      {/* HTML5 Audio element */}
      {/* crossOrigin: see the note on the other <audio> below. */}
      <audio ref={mediaElRef} crossOrigin="anonymous" preload="metadata" playsInline style={{ display: "none" }} />

      {/* Global persistent YouTube host container (keeps playing across view changes) */}
      <div
        id="onion-yt-global-wrapper"
        style={{
          position: "fixed",
          ...(expanded && displayMode === "video"
            ? {
                top: "50%",
                left: narrow ? "50%" : "calc(50% - 170px)",
                transform: "translate(-50%, -50%)",
                width: narrow ? "min(92vw, 420px)" : "min(56vw, 680px)",
                aspectRatio: "16 / 9",
                zIndex: 60,
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 25px 60px rgba(0,0,0,0.85)",
              }
            : {
                top: -9999,
                left: -9999,
                width: 356,
                height: 200,
                opacity: 0,
                pointerEvents: "none",
                zIndex: 1,
              }),
        }}
      >
        <div id="onion-yt-host" style={{ width: "100%", height: "100%" }} />
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
        .vinyl-playing {
          animation: vinyl-spin 20s linear infinite;
        }
        .vinyl-paused {
          animation: vinyl-spin 20s linear infinite;
          animation-play-state: paused;
        }
      `}</style>

      {/* Left Navigation Rail (Desktop) */}
      <div
        className="hidden md:flex flex-col gap-1.5 fixed left-0 top-0 bottom-0 px-3 pt-5"
        style={{ width: RAIL_WIDTH, borderRight: `1px solid ${colors.ring}`, zIndex: 30, background: colors.bg }}
      >
        <Link to="/music" className="flex items-center gap-1.5" style={{ textDecoration: "none", marginBottom: 16, paddingLeft: 4 }}>
          <OnionMark height={80} />
          <BrandWord word="music" height={20} />
        </Link>
        {railItem("home", "Home", Home)}
        {railItem("explore", "Explore", Compass)}
        {railItem("history", "History", History)}
        {railItem("library", "Library", Library)}
        <div style={{ borderTop: `1px solid ${colors.ring}`, margin: "14px 8px" }} />
        <Link to="/" style={{ fontSize: 13.5, color: colors.textMuted, textDecoration: "none", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <Film size={16} /> Movies &amp; Shows
        </Link>
      </div>

      <style>{`
        .music-shell { padding-left: 0; }
        @media (min-width: 768px) { .music-shell { padding-left: ${RAIL_WIDTH}px; } }
      `}</style>

      <div className="music-shell">
        {/* Top Search Bar */}
        <div
          className="sticky top-0 flex items-center gap-3 px-4 md:px-8 py-3.5 backdrop-blur-md"
          style={{ background: "rgba(12,8,18,0.85)", borderBottom: `1px solid ${colors.ring}`, zIndex: 25 }}
        >
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
                {searching ? "Searching YouTube…" : `Results for "${query.trim()}"`}
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
              <p className="max-w-md mx-auto mb-4">{error || "Search for a song, artist, or album on YouTube."}</p>
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
          className="fixed inset-0 flex flex-col"
          style={{
            background: colors.bg,
            zIndex: 55,
            paddingBottom: narrow ? NAV_HEIGHT + SHEET_PEEK : BAR_HEIGHT,
            transform: stageIn ? "translateY(0)" : "translateY(100%)",
            transition: `transform ${STAGE_MS}ms cubic-bezier(.32,.72,0,1)`,
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
          <div className="relative flex items-center justify-between px-6 pt-5 pb-3">
            <button
              onClick={() => setExpanded(false)}
              aria-label="Collapse"
              className="p-2 text-white bg-transparent border-none cursor-pointer flex items-center"
            >
              <ChevronDown size={28} />
            </button>

            {/* Song vs Video Mode Toggle */}
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
                onClick={() => switchDisplayMode("video")}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold border-none cursor-pointer transition-all"
                style={{
                  background: displayMode === "video" ? colors.accent : "transparent",
                  color: "#fff",
                }}
              >
                <Video size={15} /> Video
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
            <div onScroll={onStageScroll} className="relative flex-1 min-h-0 overflow-y-auto px-6 pb-6 flex flex-col">
              {/* Artwork or Video Placeholder */}
              <div className="flex justify-center py-4">
                {displayMode === "song" ? (
                  <div
                    onClick={toggle}
                    className={`rounded-full cursor-pointer overflow-hidden border-[6px] border-neutral-900 shadow-[0_20px_60px_rgba(0,0,0,0.95),0_0_35px_rgba(168,85,247,0.2)] relative flex items-center justify-center select-none ${
                      playing ? "vinyl-playing" : "vinyl-paused"
                    }`}
                    style={{
                      width: "min(320px, 76vw)",
                      aspectRatio: "1 / 1",
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
                    <div className="relative w-20 h-20 rounded-full bg-neutral-950/90 backdrop-blur-md border-2 border-white/25 flex items-center justify-center shadow-2xl">
                      <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center bg-black/40">
                        <div className="w-6 h-6 rounded-full bg-neutral-900 border-2 border-neutral-600 shadow-inner flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-white/90" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ height: 220, width: "100%" }} />
                )}
              </div>

              <div className="mt-4 text-center">
                <div style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 700, color: colors.text }} className="line-clamp-2">
                  {track?.title || "Nothing playing"}
                </div>
                <div style={{ fontSize: 14.5, color: colors.textMuted, marginTop: 4 }} className="truncate">
                  {track?.artist || ""}
                </div>
              </div>

              {/* Scrubber */}
              <div
                {...scrubHandlers}
                className="mt-6 py-3 cursor-pointer touch-none"
              >
                <div className="relative h-1.5 bg-white/20 rounded-full">
                  <div className="h-full bg-white rounded-full" style={{ width: `${progress}%` }} />
                  <div
                    className="absolute top-1/2 w-4 h-4 -mt-2 -ml-2 rounded-full bg-white shadow-md"
                    style={{ left: `${progress}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
                <span>{formatTime(shownPosition)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              {/* Transport Buttons */}
              <div className="flex items-center justify-between mt-6 px-4">
                <button onClick={() => setShuffle((v) => !v)} className="bg-transparent border-none cursor-pointer" style={{ color: shuffle ? colors.accentLight : colors.textMuted }}>
                  <Shuffle size={22} />
                </button>
                <button onClick={() => skip(-1)} className="bg-transparent border-none cursor-pointer text-white">
                  <SkipBack size={32} />
                </button>
                <button
                  onClick={toggle}
                  className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center border-none cursor-pointer shadow-xl hover:scale-105 transition-transform"
                >
                  {playing ? <Pause size={30} color="#0c0812" /> : <Play size={30} color="#0c0812" style={{ marginLeft: 3 }} />}
                </button>
                <button onClick={() => skip(1)} className="bg-transparent border-none cursor-pointer text-white">
                  <SkipForward size={32} />
                </button>
                <button onClick={() => setRepeat((v) => !v)} className="bg-transparent border-none cursor-pointer" style={{ color: repeat ? colors.accentLight : colors.textMuted }}>
                  <Repeat size={22} />
                </button>
              </div>
            </div>
          ) : (
            /* Desktop Stage Layout */
            <div className="relative flex-1 min-h-0 flex flex-row gap-10 px-10 pb-6">
              <div className="flex-1 flex flex-col items-center justify-center gap-6 min-h-0">
                {displayMode === "song" ? (
                  <div
                    onClick={toggle}
                    className={`rounded-full cursor-pointer overflow-hidden border-[8px] border-neutral-900 shadow-[0_30px_90px_rgba(0,0,0,0.95),0_0_40px_rgba(168,85,247,0.25)] relative flex items-center justify-center select-none ${
                      playing ? "vinyl-playing" : "vinyl-paused"
                    }`}
                    style={{
                      height: "min(420px, 48vh)",
                      aspectRatio: "1 / 1",
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

      {/* Bottom Sticky Player Bar */}
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

        {/* Playback Controls */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button onClick={() => skip(-1)} aria-label="Previous" className="bg-transparent border-none cursor-pointer text-neutral-400 hover:text-white p-0">
            <SkipBack size={21} />
          </button>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="w-10 h-10 rounded-full flex items-center justify-center border-none cursor-pointer shadow-lg hover:scale-105 transition-transform"
            style={{ background: colors.accent }}
          >
            {playing ? <Pause size={19} color="#fff" /> : <Play size={19} color="#fff" style={{ marginLeft: 2 }} />}
          </button>
          <button onClick={() => skip(1)} aria-label="Next" className="bg-transparent border-none cursor-pointer text-neutral-400 hover:text-white p-0">
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
            <div className="w-[46px] h-[46px] rounded bg-neutral-800 flex-shrink-0" />
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

          {/* Volume slider */}
          <div className="hidden sm:flex items-center group/vol">
            <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="bg-transparent border-none cursor-pointer text-neutral-400 p-0">
              {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(volume * 100)}
              onChange={(e) => setVolumeLevel(Number(e.target.value) / 100)}
              aria-label="Volume"
              className="onion-volume"
            />
          </div>

          {/* Tempo reading */}
          <button
            onClick={openRates}
            aria-label="Tempo"
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
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {narrow && (
        <div
          className="fixed left-0 right-0 bottom-0 flex items-stretch"
          style={{ height: NAV_HEIGHT, background: colors.bg, borderTop: `1px solid ${colors.ring}`, zIndex: 59 }}
        >
          {[
            ["home", "Home", Home],
            ["explore", "Explore", Compass],
            ["history", "History", History],
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
              <Icon size={19} color={view === key ? colors.accentLight : colors.textMuted} />
              {label}
            </button>
          ))}
          <Link
            to="/"
            className="flex-1 flex flex-col items-center justify-center gap-1 text-neutral-400 no-underline"
            style={{ fontFamily: bodyFont, fontSize: 10.5, fontWeight: 500 }}
          >
            <Film size={19} />
            Movies
          </Link>
        </div>
      )}

      {/* Tempo & Pitch Adjustment Modal */}
      {ratesOpen && (
        <>
          <div onClick={cancelRates} className="fixed inset-0 bg-black/60 z-[70] backdrop-blur-sm" />
          <div
            className="fixed rounded-2xl p-6"
            style={{
              left: "50%",
              bottom: narrow ? NAV_HEIGHT + 14 : BAR_HEIGHT + 16,
              transform: "translateX(-50%)",
              width: "min(540px, 94vw)",
              background: colors.bgElevated,
              border: `1px solid ${colors.ring}`,
              boxShadow: "0 25px 60px rgba(0,0,0,0.85)",
              zIndex: 71,
            }}
          >
            <div style={{ fontFamily: displayFont, fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
              Playback Speed &amp; Pitch
            </div>

            {/* Tempo Slider */}
            <div className="py-2">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-400 uppercase mb-2">
                <span>Tempo</span>
                <span className="text-white text-base font-mono">{tempo.toFixed(2)}x</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onTempoChange(tempo - rateStep)}
                  className="p-1.5 rounded bg-white/10 text-white border-none cursor-pointer flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="range"
                  min={RATE_MIN}
                  max={RATE_MAX}
                  step={0.01}
                  value={tempo}
                  onChange={(e) => onTempoChange(Number(e.target.value))}
                  className="onion-rate"
                />
                <button
                  onClick={() => onTempoChange(tempo + rateStep)}
                  className="p-1.5 rounded bg-white/10 text-white border-none cursor-pointer flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-neutral-500 mt-1 px-8">
                <span>{RATE_MIN}x</span>
                <span>{RATE_MAX}x</span>
              </div>
            </div>

            <div className="border-t border-white/10 my-3" />

            {/* Pitch Slider */}
            <div className="py-2">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-400 uppercase mb-2">
                <span>Pitch</span>
                <span className="text-white text-base font-mono">{Math.round(pitch * 100)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onPitchChange(pitch - rateStep)}
                  className="p-1.5 rounded bg-white/10 text-white border-none cursor-pointer flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="range"
                  min={RATE_MIN}
                  max={RATE_MAX}
                  step={0.01}
                  value={pitch}
                  onChange={(e) => onPitchChange(Number(e.target.value))}
                  className="onion-rate"
                />
                <button
                  onClick={() => onPitchChange(pitch + rateStep)}
                  className="p-1.5 rounded bg-white/10 text-white border-none cursor-pointer flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-neutral-500 mt-1 px-8">
                <span>{Math.round(RATE_MIN * 100)}%</span>
                <span>{Math.round(RATE_MAX * 100)}%</span>
              </div>
            </div>

            <div className="border-t border-white/10 my-3" />

            {/* Step sizes */}
            <div className="flex items-center gap-2 flex-wrap py-1">
              <span className="text-xs font-bold text-neutral-400 uppercase mr-2">Step</span>
              {RATE_STEPS.map(([label, value]) => (
                <button
                  key={label}
                  onClick={() => setRateStep(value)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer transition-all"
                  style={{
                    background: rateStep === value ? colors.text : "rgba(255,255,255,0.08)",
                    color: rateStep === value ? colors.bg : colors.text,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="border-t border-white/10 my-3" />

            {/* Unhook Button */}
            <button
              onClick={() => onUnhookChange(!unhook)}
              className="w-full flex items-start gap-3 text-left py-2 px-1 rounded-lg bg-transparent border-none cursor-pointer transition-colors hover:bg-white/[0.04]"
            >
              <span
                className="flex items-center justify-center flex-shrink-0 mt-0.5 rounded"
                style={{
                  width: 22,
                  height: 22,
                  border: `1.5px solid ${unhook ? colors.accent : colors.ring}`,
                  background: unhook ? colors.accent : "transparent",
                }}
              >
                {unhook ? <Unlink size={13} color="#fff" /> : <Link2 size={13} color={colors.textMuted} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">
                  Unhook tempo from pitch
                </span>
                <span className="block text-xs text-neutral-400 mt-1 leading-relaxed">
                  {unhook
                    ? "Set apart. Speed can change without the key going with it."
                    : "Tied together, like a record spun faster — moving one moves the other."}
                </span>
              </span>
            </button>

            {rateNote && (
              <div className="mt-3 p-3 rounded bg-white/5 border border-white/10 text-xs text-neutral-400 leading-relaxed">
                {rateNote}
              </div>
            )}

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/10">
              <button
                onClick={resetRates}
                className="bg-transparent border-none text-neutral-400 text-xs font-bold cursor-pointer hover:text-white px-2 py-1.5"
              >
                RESET
              </button>
              <div className="flex gap-2">
                <button
                  onClick={cancelRates}
                  className="bg-transparent border-none text-neutral-400 text-xs font-bold cursor-pointer hover:text-white px-4 py-1.5"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => setRatesOpen(false)}
                  className="px-5 py-2 rounded-lg text-xs font-bold text-white border-none cursor-pointer transition-transform hover:scale-105"
                  style={{ background: colors.accent }}
                >
                  DONE
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Persistent Audio & Video Players */}
      {/*
        crossOrigin is not optional. Without it the element loads the stream as
        a no-cors request, and Chrome's Opaque Response Blocking drops it: the
        first Range answer is two bytes, too few to sniff as audio, so ORB
        refuses a response it cannot identify and the element reports "no
        supported sources". Asking for CORS instead makes it a checked response
        — the API already echoes the origin back — and ORB does not apply.
      */}
      <audio
        ref={mediaElRef}
        crossOrigin="anonymous"
        preload="auto"
        playsInline
        style={{ position: "fixed", bottom: -9999, left: -9999, opacity: 0, pointerEvents: "none" }}
      />
      <div
        style={{
          position: "fixed",
          bottom: displayMode === "video" && expanded ? 0 : -9999,
          left: displayMode === "video" && expanded ? 0 : -9999,
          right: displayMode === "video" && expanded ? 0 : undefined,
          top: displayMode === "video" && expanded ? 60 : undefined,
          zIndex: displayMode === "video" && expanded ? 60 : -1,
          width: displayMode === "video" && expanded ? "100%" : "200px",
          height: displayMode === "video" && expanded ? "calc(100% - 140px)" : "200px",
          pointerEvents: displayMode === "video" && expanded ? "auto" : "none",
          background: "#000",
        }}
      >
        <div id="onion-yt-host" style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}