import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Play, Pause, SkipBack, SkipForward, Search, X, Music, Home, Compass,
  Library, Shuffle, Repeat, Volume2, VolumeX, ChevronDown, ChevronUp, Film, History,
  ArrowLeft, Clock, TrendingUp, Sparkles, ArrowUpLeft,
  ThumbsUp, ThumbsDown,
} from "lucide-react";
import { colors, bodyFont, displayFont } from "../theme";
import OnionMark from "../components/shared/OnionMark";
import BrandWord from "../components/shared/BrandWord";
import ExploreView from "../components/music/ExploreView";
import api from "../api/client";

/*
 * Music.
 *
 * Laid out the way a music app is: a rail down the left, a search bar across
 * the top, rows of cards, and a bar along the bottom that stays put while you
 * browse. Opening the bar gives the full now-playing view.
 *
 * ---------------------------------------------------------------------------
 * Playback: YouTube's player behind a media-element interface.
 * ---------------------------------------------------------------------------
 *
 * This was written for a plain <audio> element, which is the right shape: an
 * element the page owns is the only thing that keeps playing when a phone's
 * screen locks, and it takes Media Session metadata straight to the lock
 * screen. All of that is still here.
 *
 * What it does not have is bytes. Every track in the catalog comes from YouTube,
 * which supplies metadata and no audio file, so `<audio>` had nothing to load
 * and nothing played at all. The engine underneath is YouTube's IFrame player
 * again, wrapped in `youtubeEngine()` so it answers the same handful of
 * properties a media element does — paused, currentTime, duration, muted,
 * play(), pause(). Everything above that line is unchanged.
 *
 * The costs, which are YouTube's rules rather than choices made here:
 *
 *   - The player is visible. Hiding any part of it is against the API terms and
 *     gets keys revoked, so it sits in the stage rather than off-screen.
 *   - It stops when a phone's screen goes off. A cross-origin iframe is
 *     suspended by the browser when the page is hidden, and YouTube gates
 *     background audio behind Premium.
 *
 * Both go away the day tracks carry a real `audioUrl`: swap `youtubeEngine`
 * for an <audio> element against /music/stream/:id and nothing else changes.
 */

const SEARCH_DEBOUNCE_MS = 500;
const IFRAME_API = "https://www.youtube.com/iframe_api";

/** Loads YouTube's IFrame API once, however many callers ask for it. */
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

/**
 * A YouTube player wearing a media element's clothes.
 *
 * Only the surface the rest of this file already uses: the properties it reads,
 * the two methods it calls, and `dataset` so the load effect can tell whether
 * the source actually changed. Anything else a real element offers is not here,
 * because nothing asks for it.
 */
function youtubeEngine(player) {
  return {
    dataset: {},
    loop: false,
    playbackRate: 1,
    play: () => Promise.resolve(player.playVideo?.()),
    pause: () => player.pauseVideo?.(),
    load: () => {},
    setSource(videoId, { autoplay }) {
      if (autoplay) player.loadVideoById?.(videoId);
      else player.cueVideoById?.(videoId);
    },
    get paused() {
      return player.getPlayerState?.() !== window.YT?.PlayerState?.PLAYING;
    },
    get currentTime() {
      return player.getCurrentTime?.() || 0;
    },
    set currentTime(to) {
      player.seekTo?.(to, true);
    },
    get duration() {
      return player.getDuration?.() || 0;
    },
    get muted() {
      return Boolean(player.isMuted?.());
    },
    set muted(value) {
      if (value) player.mute?.();
      else player.unMute?.();
    },
    get volume() {
      return (player.getVolume?.() ?? 100) / 100;
    },
    set volume(value) {
      player.setVolume?.(Math.round(value * 100));
    },
  };
}

// What the engine is asked to load. A track that carries its own audio would
// give a URL here; a YouTube one gives the video id, which is what its player
// wants. Either way the load effect below only cares whether it changed.
function sourceOf(track) {
  return track?.streamUrl || track?.sourceId || "";
}

// How long the stage takes to slide, and how long it stays mounted after being
// asked to close.
const STAGE_MS = 340;
// How far down the stage the bar waits before appearing — roughly the point
// where the stage's own controls have scrolled out of sight.
const BAR_REVEAL_AT = 120;
// How much of the queue sheet stays on screen when it is down — enough to show
// the handle and the label, so it reads as something to pull.
const SHEET_PEEK = 66;
// YouTube's terms floor the player at 200x200, so the docked size is the
// smallest 16:9 box that clears it rather than the smallest that looks tidy.
const DOCK_WIDTH = 356;
const DOCK_HEIGHT = 200;
const DOCK_MARGIN = 14;

const RAIL_WIDTH = 232;
const BAR_HEIGHT = 76;
// A phone gets the rail as a bottom bar instead, the way music apps do it.
const NAV_HEIGHT = 58;
const NARROW = "(max-width: 767px)";
const SEEK_STEP = 10;

const MOODS = [
  "Podcasts", "Work out", "Energise", "Romance", "Feel good",
  "Sleep", "Commute", "Relax", "Party", "Sad", "Focus",
];

const RECENT_KEY = "onion.music.recent";
const SEARCHES_KEY = "onion.music.searches";

// What the search screen offers before anything has been typed.
const SHORTCUTS = [
  ["New releases", Sparkles, "new songs 2026"],
  ["Charts", TrendingUp, "top songs india"],
  ["Moods and genres", Music, "lofi chill songs"],
  ["Podcasts", Library, "podcast hindi"],
];

function readSearches() {
  try {
    return JSON.parse(localStorage.getItem(SEARCHES_KEY) || "[]");
  } catch {
    return [];
  }
}

function rememberSearch(term) {
  try {
    const kept = readSearches().filter((t) => t.toLowerCase() !== term.toLowerCase());
    localStorage.setItem(SEARCHES_KEY, JSON.stringify([term, ...kept].slice(0, 8)));
  } catch {
    // Storage is a convenience here; searching works without it.
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "SonyMusicIndiaVEVO" is a channel name, not something to read in a heading. */
function channelLabel(name) {
  return String(name || "")
    .replace(/vevo$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
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

export default function MusicPage() {
  const [view, setView] = useState("home");
  const [tracks, setTracks] = useState(null);
  const [albums, setAlbums] = useState(null);
  const [recent, setRecent] = useState(() => readRecent());
  const [forYou, setForYou] = useState([]);
  // Explore's own rows, fetched once when it is first opened rather than on
  // every visit to the page.
  const [explore, setExplore] = useState({ albums: [], top: [] });
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState("songs");
  const [nowPlaying, setNowPlaying] = useState(null);
  // What plays next, which is not the same thing as what is on screen. Picking
  // a song fills this with songs like it; browsing away does not disturb it.
  const [queue, setQueue] = useState([]);
  const [autoplay, setAutoplay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [liked, setLiked] = useState(null);
  const [expanded, setExpanded] = useState(false);
  // Mounted covers the exit as well as the entrance: a stage unmounted the
  // instant it closes has nothing left to animate, so it would just vanish.
  const [stageMounted, setStageMounted] = useState(false);
  const [stageIn, setStageIn] = useState(false);
  // The stage opens with its own controls in view, so the bar starts hidden and
  // appears once they have been scrolled past. Always there when the stage is
  // closed.
  const [barVisible, setBarVisible] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(NARROW).matches
  );
  const [mobileSearch, setMobileSearch] = useState(false);
  // A wide screen has no magnifier to tap, so the field's own focus is what
  // opens the search screen there.
  const [searchFocused, setSearchFocused] = useState(false);
  const [searches, setSearches] = useState(() => readSearches());

  useEffect(() => {
    const q = window.matchMedia?.(NARROW);
    if (!q) return;
    const onChange = (e) => setNarrow(e.matches);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);

  const audioRef = useRef(null);
  const playerRef = useRef(null);
  const playerHostRef = useRef(null);
  const playerBoxRef = useRef(null);
  const playerSlotRef = useRef(null);
  const tracksRef = useRef(null);
  const queueRef = useRef([]);
  // The keyboard and lock-screen handlers are bound once but have to call the
  // current version of these, so they go through a ref rather than closing over
  // whatever render happened to install them.
  const actionsRef = useRef({});

  const searchActive = query.trim().length >= 2;
  // Declared after `searchActive`, not beside the state it reads: a const that
  // uses a later const is a temporal dead zone error, and it took the whole
  // page down rather than just this line.
  const searchScreen = (narrow ? mobileSearch : searchFocused) && !searchActive;
  const track = nowPlaying;
  tracksRef.current = tracks;
  queueRef.current = queue;

  useEffect(() => {
    api
      .get("/music/tracks?limit=50")
      .then((data) => {
        setTracks(data);
        // Whatever was on last, rather than whatever is trending today —
        // reopening the page and being handed the same chart song is not
        // where anyone left off.
        const last = readRecent()[0];
        setNowPlaying(last || data[0] || null);
        setQueue(last ? [last, ...data] : data);
      })
      .catch((err) => {
        console.error("fetchTracks error:", err);
        setError(err.message);
        setTracks([]);
      });
  }, []);

  /*
   * Explore's rows. The albums come from the album search, the top songs from
   * the chart the page already knows how to ask for — one request each, and
   * only the first time Explore is opened.
   */
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

  /*
   * "Because you listened to…" — built from the most recent play.
   *
   * Only asked for when there is history, and the endpoint answers from the
   * catalog when it can, so a second visit with the same taste costs nothing.
   */
  const seedTrack = recent[0];
  const seedId = seedTrack?.sourceId;
  useEffect(() => {
    const seed = seedTrack;
    if (!seed?.artist) return;
    let cancelled = false;
    api
      .get(
        `/music/related?title=${encodeURIComponent(seed.title || "")}` +
          `&artist=${encodeURIComponent(seed.artist)}&exclude=${encodeURIComponent(seed.sourceId || "")}&limit=12`
      )
      .then((data) => {
        if (!cancelled) setForYou(data);
      })
      .catch((err) => console.error("forYou error:", err));
    return () => {
      cancelled = true;
    };
    // Keyed on the id alone: `recent` is a new array on every read, and
    // depending on it would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedId]);

  // Debounced: a search is not free at the other end either.
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
          rememberSearch(q);
          setSearches(readSearches());
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

  /*
   * Point the element at a song.
   *
   * `dataset.sourceId` is the record of what is loaded, and it is checked before
   * touching `src`: assigning the same URL again restarts the song from zero.
   * The tap handler in `play()` gets there first for anything a person clicked,
   * so in practice this effect is what loads the resumed track on a cold open
   * and what advances the queue.
   *
   * A load without `autoplay` deliberately does not call play() — opening the
   * page should be silent, and a search should not start something nobody asked
   * for.
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    const source = sourceOf(track);
    if (!source) {
      setError("No audio for that one yet.");
      return;
    }
    if (audio.dataset.sourceId !== String(source)) {
      audio.dataset.sourceId = String(source);
      audio.setSource(source, { autoplay });
    }
    if (autoplay && audio.paused) {
      audio.play().catch((err) => {
        // A rejected play() here is almost always the autoplay policy: the
        // browser wants the next start to come from a tap. Not an error worth
        // shouting about.
        console.warn("play() rejected:", err?.name || err);
      });
    }
  }, [track?.sourceId, track?.streamUrl, autoplay, engineReady]);

  useEffect(() => {
    if (!track || !autoplay) return;
    rememberRecent(track);
    setRecent(readRecent());
    setLiked(null);
  }, [track?.sourceId, autoplay, track]);

  // Repeat is the element's own loop flag rather than something reimplemented
  // on `ended` — looping this way has no gap and no second network trip.
  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = repeat;
  }, [repeat]);

  /*
   * Where the player sits: the slot the stage leaves for it, or the corner.
   *
   * Written straight to the element and called synchronously from the scroll
   * event — through React state and a frame of delay it lags the page by a
   * pixel or two, which reads as a wobble.
   */
  const placePlayer = useCallback(() => {
    const el = playerBoxRef.current;
    if (!el) return;

    const slot = playerSlotRef.current;
    let box;
    if (stageMounted && slot) {
      const r = slot.getBoundingClientRect();
      box = { top: r.top, left: r.left, width: r.width, height: r.height };
    } else {
      const width = Math.min(DOCK_WIDTH, window.innerWidth - DOCK_MARGIN * 2);
      const height = Math.max(DOCK_HEIGHT, Math.round((width * 9) / 16));
      box = {
        top: window.innerHeight - height - BAR_HEIGHT - (narrow ? NAV_HEIGHT : 0) - DOCK_MARGIN,
        left: window.innerWidth - width - DOCK_MARGIN,
        width,
        height,
      };
    }

    el.style.top = `${box.top}px`;
    el.style.left = `${box.left}px`;
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
  }, [stageMounted, narrow]);

  useLayoutEffect(() => {
    placePlayer();
    const settle = requestAnimationFrame(placePlayer);
    document.addEventListener("scroll", placePlayer, { passive: true, capture: true });
    window.addEventListener("resize", placePlayer);

    const observer = new ResizeObserver(placePlayer);
    if (playerSlotRef.current) observer.observe(playerSlotRef.current);

    return () => {
      cancelAnimationFrame(settle);
      document.removeEventListener("scroll", placePlayer, { capture: true });
      window.removeEventListener("resize", placePlayer);
      observer.disconnect();
    };
  }, [placePlayer, stageIn, sheetOpen, tracks, view]);

  /*
   * The player itself, built once and then left alone.
   *
   * Its events are what drive `playing`, `duration` and the queue advancing —
   * the same job the <audio> element's own events used to do, so the state
   * above it never learns which engine it is talking to.
   */
  useEffect(() => {
    let destroyed = false;

    loadYoutubeApi().then((YT) => {
      if (destroyed || !playerHostRef.current || playerRef.current) return;

      playerRef.current = new YT.Player(playerHostRef.current, {
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            // From here the rest of the file has something to talk to. The load
            // effect runs again on the next render and cues whatever is current.
            audioRef.current = youtubeEngine(playerRef.current);
            setEngineReady(true);
          },
          onStateChange: (e) => {
            const state = YT.PlayerState;
            setPlaying(e.data === state.PLAYING);
            setBuffering(e.data === state.BUFFERING);
            if (e.data === state.PLAYING || e.data === state.PAUSED) {
              setDuration(playerRef.current?.getDuration?.() || 0);
            }
            if (e.data === state.ENDED) actionsRef.current.ended?.();
          },
          onError: () => {
            setBuffering(false);
            setError("That one would not play here — the owner may have blocked embedding.");
          },
        },
      });
    });

    return () => {
      destroyed = true;
    };
  }, []);

  // The player has no timeupdate event, so it has to be asked.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden || !playerRef.current?.getCurrentTime) return;
      setPosition(playerRef.current.getCurrentTime() || 0);
      const d = playerRef.current.getDuration?.() || 0;
      if (d) setDuration(d);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  /*
   * Lock-screen and notification controls.
   *
   * With a real <audio> element behind it this is no longer decorative: the
   * metadata is what the phone shows on the lock screen while the screen is off,
   * and these handlers are the buttons on it.
   */
  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session || !track || typeof window.MediaMetadata !== "function") return;

    session.metadata = new window.MediaMetadata({
      title: track.title || "",
      artist: channelLabel(track.artist) || "",
      album: "Onion Music",
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
      const end = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime;
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
      ["seekto", (d) => {
        const audio = audioRef.current;
        if (audio && typeof d?.seekTime === "number") audio.currentTime = d.seekTime;
      }],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not every browser offers every action; the ones it does still work.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Nothing to undo if it was never accepted.
        }
      }
    };
  }, [track?.sourceId, track?.title, track?.artist, track?.artworkUrl]);

  // The scrubber on the lock screen, and whether the OS draws a play or a pause
  // button. Kept out of the effect above so that changing state does not tear
  // down and rebuild every handler.
  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    session.playbackState = playing ? "playing" : "paused";
    if (typeof session.setPositionState !== "function") return;
    try {
      if (Number.isFinite(duration) && duration > 0) {
        session.setPositionState({
          duration,
          position: Math.min(position, duration),
          playbackRate: audioRef.current?.playbackRate || 1,
        });
      }
    } catch {
      // Safari throws on some state combinations rather than ignoring them.
    }
  }, [playing, position, duration]);

  /*
   * Keyboard, on anything with one. Space for play, up and down for volume,
   * left and right for the previous and next song.
   *
   * Bound once and routed through `actionsRef`, so the listener is not removed
   * and re-added on every render. Ignored while typing, or the search box would
   * pause the music on its first space. `preventDefault` on the arrows and
   * space, since both scroll the page otherwise.
   */
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
          audio.volume = Math.min(1, audio.volume + 0.1);
          if (audio.muted) { audio.muted = false; setMuted(false); }
          break;
        case "ArrowDown":
          e.preventDefault();
          audio.volume = Math.max(0, audio.volume - 0.1);
          break;
        case "ArrowRight":
          e.preventDefault();
          actionsRef.current.skip?.(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          actionsRef.current.skip?.(-1);
          break;
        default:
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /*
   * Sliding the stage up and down.
   *
   * There has to be a gap between mounting the stage and moving it: applied in
   * the same commit, the browser has no starting position to animate from and
   * the stage simply appears. A timer rather than requestAnimationFrame —
   * measured, the frame callbacks did not always run here and the stage stayed
   * off-screen, while a timer opens it every time.
   */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  /*
   * The stage covers the page, but the page behind it keeps its own scrollbar —
   * two bars side by side, and the outer one scrolling something nobody can
   * see. Locked while the stage is open, restored when it closes.
   */
  useEffect(() => {
    if (!stageMounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [stageMounted]);

  /*
   * The bar follows the stage's own controls.
   *
   * At the top of the stage the big play button and the scrubber are on screen,
   * so the bar would be a second copy of them. Scroll down into the queue and
   * they leave — that is when the bar is worth having, and when it appears.
   */
  const onStageScroll = (e) => {
    if (!narrow) return;
    setBarVisible(e.currentTarget.scrollTop > BAR_REVEAL_AT);
  };

  const upNextHeading = (
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: colors.textMuted, textTransform: "uppercase", marginBottom: 10 }}>
      Up next
    </div>
  );

  /*
   * Starting a song from a tap.
   *
   * The src is assigned and play() is called right here, inside the handler for
   * the gesture that asked for it. That is not a stylistic choice: iOS only
   * counts a play() as user-initiated if it happens synchronously in the
   * gesture, and the first one in the page's life is the one that unlocks audio
   * for every later start — including the ones the queue makes on its own with
   * the screen off. Setting state and letting an effect play a tick later is
   * exactly the shape that leaves iOS silent.
   */
  const play = (t) => {
    const audio = audioRef.current;
    const source = sourceOf(t);
    if (audio && source) {
      // Loaded and started inside the tap, not from an effect a tick later:
      // that first gesture is what unlocks audio for every later start.
      if (audio.dataset.sourceId !== String(source)) {
        audio.dataset.sourceId = String(source);
        audio.setSource(source, { autoplay: true });
      } else {
        audio.play();
      }
    }
    setAutoplay(true);
    setNowPlaying(t);
    // Start the queue with what is on, so Up next is never briefly empty.
    setQueue([t]);

    api
      .get(
        `/music/related?title=${encodeURIComponent(t.title || "")}` +
          `&artist=${encodeURIComponent(t.artist || "")}&exclude=${encodeURIComponent(t.sourceId || "")}`
      )
      .then((related) => setQueue([t, ...related]))
      .catch((err) => {
        // A failed recommendation should not stop the music: fall back to
        // whatever list the song was picked from.
        console.error("related error:", err);
        setQueue([t, ...(tracksRef.current || []).filter((x) => x.sourceId !== t.sourceId)]);
      });
  };

  const resume = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setAutoplay(true);
    audio.play().catch((err) => console.warn("play() rejected:", err?.name || err));
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) resume();
    else audio.pause();
  };

  const skip = (delta) => {
    const list = queueRef.current?.length ? queueRef.current : tracksRef.current;
    if (!list?.length) return;
    setAutoplay(true);
    if (shuffle && delta > 0) {
      setNowPlaying(list[Math.floor(Math.random() * list.length)]);
      return;
    }
    const i = list.findIndex((t) => t.sourceId === nowPlaying?.sourceId);
    setNowPlaying(list[Math.min(list.length - 1, Math.max(0, i + delta))]);
  };

  // What the queue does when a song runs out. `repeat` never reaches here — the
  // element loops itself and never fires `ended`.
  const onEnded = () => {
    const list = queueRef.current?.length ? queueRef.current : tracksRef.current;
    if (!list?.length) return;
    setAutoplay(true);
    if (shuffle) {
      setNowPlaying(list[Math.floor(Math.random() * list.length)]);
      return;
    }
    const i = list.findIndex((t) => t.sourceId === nowPlaying?.sourceId);
    if (i >= 0 && i + 1 < list.length) setNowPlaying(list[i + 1]);
    else setPlaying(false);
  };

  /*
   * Scrubbing.
   *
   * Pointer events rather than a click, so the position follows a finger or a
   * held mouse instead of only landing where it is let go. `setPointerCapture`
   * keeps the drag alive when it wanders off the 4px bar, which is most drags.
   *
   * The element is only told the new time when the drag ends: writing
   * currentTime on every move makes the audio stutter as it re-seeks.
   */
  const [scrubbing, setScrubbing] = useState(null);

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

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  };

  // Bound handlers read the current versions from here.
  actionsRef.current = { toggle, skip, resume, ended: onEnded };

  // While a finger is down the bar follows the finger, not the audio.
  const shownPosition = scrubbing ?? position;
  const progress = duration ? (shownPosition / duration) * 100 : 0;
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
      {/*
       * The audio engine.
       *
       * One element, mounted for the life of the page, never unmounted and never
       * recreated — a media element that gets torn down and rebuilt loses the
       * iOS gesture unlock along with it, and the next background start goes
       * silent. `preload="metadata"` so a cued song knows its own length without
       * pulling the whole file down.
       */}
      {/* The player. One instance for the life of the page, moved by animating
          its box rather than re-rendered anywhere — moving an iframe in the DOM
          reloads it and the music stops.

          It is visible, at YouTube's 200x200 floor or above, because the API
          terms do not allow any part of it to be covered. */}
      <div
        ref={playerBoxRef}
        style={{
          position: "fixed",
          top: -9999,
          left: -9999,
          width: DOCK_WIDTH,
          height: DOCK_HEIGHT,
          zIndex: stageMounted ? 58 : 40,
          borderRadius: 10,
          overflow: "hidden",
          background: "#000",
          boxShadow: stageMounted ? "none" : "0 16px 40px rgba(0,0,0,0.7)",
          border: stageMounted ? "none" : `1px solid ${colors.ring}`,
        }}
      >
        <div ref={playerHostRef} className="w-full h-full" />
      </div>

      <style>{`
        @keyframes onion-search-in {
          from { opacity: 0; transform: translateY(-6px) scaleX(0.94); }
          to { opacity: 1; transform: none; }
        }
        @keyframes onion-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>

      {/* Rail */}
      <div
        className="hidden md:flex flex-col gap-1 fixed left-0 top-0 bottom-0 px-3 pt-4"
        style={{ width: RAIL_WIDTH, borderRight: `1px solid ${colors.ring}`, zIndex: 30, background: colors.bg }}
      >
        {/* The mark alone says Onion, which is the film app. This is a
            different room in the same house, so it says which one. */}
        {/* The mark, and "music" drawn in the same letterforms as the logo —
            not set in a typeface next to it. The word "onion" is gone: the mark
            already says it, and saying it twice made the lockup a mouthful. */}
        <Link to="/music" className="flex items-center gap-1" style={{ textDecoration: "none", marginBottom: 10, paddingLeft: 2 }}>
          <OnionMark height={86} />
          <BrandWord word="music" height={30} />
        </Link>
        {railItem("home", "Home", Home)}
        {railItem("explore", "Explore", Compass)}
        {railItem("history", "History", History)}
        {railItem("library", "Library", Library)}
        <div style={{ borderTop: `1px solid ${colors.ring}`, margin: "14px 8px" }} />
        <Link to="/" style={{ fontSize: 13, color: colors.textMuted, textDecoration: "none", padding: "8px 14px" }}>
          ← Movies & series
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
              <Link to="/music" className="flex items-center gap-0.5" style={{ textDecoration: "none" }}>
                <OnionMark height={62} />
                <BrandWord word="music" height={21} />
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
              style={{
                background: "rgba(255,255,255,0.07)", border: `1px solid ${colors.ring}`, maxWidth: 620,
                // Grows into place when the magnifier is tapped, rather than
                // appearing fully formed.
                animation: mobileSearch ? "onion-search-in 220ms cubic-bezier(.32,.72,0,1)" : "none",
              }}
            >
              {narrow && mobileSearch ? (
                <button
                  onClick={() => { setQuery(""); setMobileSearch(false); }}
                  aria-label="Back"
                  style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: colors.textMuted }}
                >
                  <ArrowLeft size={19} />
                </button>
              ) : (
                <Search size={17} color={colors.textMuted} />
              )}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const term = query.trim();
                  if (term.length < 2) return;
                  rememberSearch(term);
                  setSearches(readSearches());
                }}
                placeholder="Type to search"
                autoFocus={mobileSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => {
                  // Late enough that a click on a shortcut lands before the
                  // screen it sits on is taken away.
                  setTimeout(() => setSearchFocused(false), 160);
                }}
                className="bg-transparent flex-1"
                style={{
                  color: colors.text, fontSize: 14.5,
                  // Both, and inline: the browser draws its own ring on a
                  // focused field, and Tailwind's outline-none was losing to it.
                  outline: "none", boxShadow: "none", border: "none",
                }}
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
          style={{ paddingBottom: BAR_HEIGHT + (narrow ? NAV_HEIGHT : 0) + 40 }}
        >
          {/* The search screen. What a music app shows once the field is open
              and still empty: what was looked for before, and a way in without
              typing at all. */}
          {searchScreen && (
            <div style={{ animation: "onion-fade-up 260ms cubic-bezier(.32,.72,0,1)" }}>
              {searches.length > 0 && (
                <>
                  <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 6 }}>Recent searches</div>
                  {searches.map((term) => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      className="w-full flex items-center gap-3 text-left"
                      style={{ background: "none", border: "none", padding: "11px 2px", cursor: "pointer" }}
                    >
                      <Clock size={17} color={colors.textMuted} />
                      <span style={{ flex: 1, fontSize: 14.5, color: colors.text }} className="truncate">{term}</span>
                      <ArrowUpLeft size={16} color={colors.textMuted} />
                    </button>
                  ))}
                </>
              )}

              <div className="grid grid-cols-2 gap-3 mt-5">
                {SHORTCUTS.map(([label, Icon, term]) => (
                  <button
                    key={label}
                    onClick={() => setQuery(term)}
                    className="flex flex-col items-start gap-3 rounded-lg"
                    style={{
                      background: "rgba(255,255,255,0.06)", border: `1px solid ${colors.ring}`,
                      padding: "16px 14px", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <Icon size={20} color={colors.accentLight} />
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: colors.text }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Moods, the way YouTube Music opens */}
          {!searchActive && !searchScreen && (
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

          {searchScreen ? null : (view === "history" || view === "library") && !searchActive ? (
            recent.length ? (
              <>
                {view === "history" && (
                  <div style={{ fontFamily: displayFont, fontSize: 26, fontWeight: 600, marginBottom: 14 }}>History</div>
                )}
                {cardRow("Listen again", recent)}
                <div style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 600, marginBottom: 10 }}>
                  {view === "history" ? "Everything you have played" : "Recent"}
                </div>
                {recent.map(trackRow)}
              </>
            ) : (
              <div style={{ color: colors.textMuted, fontSize: 14, paddingTop: 24 }}>
                {view === "history" ? <History size={26} /> : <Library size={26} />}
                <p className="mt-3">Nothing here yet. Whatever you play shows up in this list.</p>
              </div>
            )
          ) : view === "explore" && !searchActive ? (
            <ExploreView
              shortcuts={SHORTCUTS}
              onShortcut={setQuery}
              albums={explore.albums}
              top={explore.top}
              moods={MOODS}
              onMood={(mood) => setQuery(`${mood} songs`)}
              onPlay={play}
              cardRow={cardRow}
              trackRow={trackRow}
            />
          ) : list === null ? (
            <div className="space-y-3 animate-pulse">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ height: 60, background: colors.bgElevated, borderRadius: 8 }} />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div style={{ color: colors.textMuted, fontSize: 14, paddingTop: 24, maxWidth: 520, lineHeight: 1.7 }}>
              <Music size={26} />
              <p className="mt-3">{error || "Search for a song, an artist or an album."}</p>
            </div>
          ) : (
            <>
              {!searchActive && recent.length > 0 && cardRow("Listen again", recent)}
              {!searchActive && forYou.length > 0 &&
                cardRow(`Because you listened to ${channelLabel(recent[0]?.artist)}`, forYou)}
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
      {stageMounted && (
        <div
          className="fixed inset-0 flex flex-col"
          style={{
            background: colors.bg,
            zIndex: 55,
            // On a phone the bar is hidden until the queue is scrolled to, so
            // reserving its height leaves a strip of nothing and cuts the
            // controls in half. Only the nav is always there; the bar overlays
            // the queue when it does appear, which is what it should do.
            paddingBottom: narrow ? NAV_HEIGHT + SHEET_PEEK : BAR_HEIGHT,
            transform: stageIn ? "translateY(0)" : "translateY(100%)",
            transition: `transform ${STAGE_MS}ms cubic-bezier(.32,.72,0,1)`,
            willChange: "transform",
          }}
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
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: colors.textMuted, margin: "0 auto" }}>
              {buffering ? "Buffering" : "Now playing"}
            </div>
            <span style={{ width: 24 }} />
          </div>

          {narrow ? (
            /* A phone: one column, the artwork in the middle of it, controls
               large enough for a thumb, and the queue underneath. */
            <div onScroll={onStageScroll} className="relative flex-1 min-h-0 overflow-y-auto px-5 pb-6 flex flex-col">
              <div className="flex justify-center py-3">
                <div
                  onClick={toggle}
                  role="button"
                  aria-label={playing ? "Pause" : "Play"}
                  className="rounded-lg cursor-pointer"
                  style={{
                    width: "min(176px, 46vw)", aspectRatio: "1 / 1",
                    background: track?.artworkUrl ? `url(${track.artworkUrl}) center/cover no-repeat` : colors.bgElevated,
                    boxShadow: "0 26px 60px rgba(0,0,0,0.6)",
                  }}
                />
              </div>
              {/* The slot the player is flown into. Full-bleed so that at 16:9
                  on a 375px screen it still clears YouTube's 200px floor. */}
              <div
                ref={playerSlotRef}
                className="rounded-lg"
                style={{ marginLeft: -20, marginRight: -20, marginTop: 12, aspectRatio: "16 / 9", minHeight: 200, background: "#000" }}
              />

              <div className="mt-4">
                <div style={{ fontFamily: displayFont, fontSize: 20, fontWeight: 600, color: colors.text }} className="line-clamp-2">
                  {track?.title || "Nothing playing"}
                </div>
                <div style={{ fontSize: 14, color: colors.textMuted, marginTop: 4 }} className="truncate">
                  {track?.artist || ""}
                </div>
              </div>
              {/* The padding is the hit area: a 4px line is not something a
                  thumb can catch, so the bar is drawn thin inside a 20px band
                  that takes the touch. */}
              <div
                {...scrubHandlers}
                className="mt-3"
                style={{ padding: "8px 0", cursor: duration ? "pointer" : "default", touchAction: "none" }}
              >
                <div style={{ position: "relative", height: 4, background: "rgba(255,255,255,0.16)", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: colors.text, borderRadius: 2 }} />
                  <div
                    style={{
                      position: "absolute", top: "50%", left: `${progress}%`,
                      width: 13, height: 13, marginTop: -6.5, marginLeft: -6.5,
                      borderRadius: "50%", background: colors.text,
                      opacity: duration ? 1 : 0,
                      transform: scrubbing !== null ? "scale(1.3)" : "scale(1)",
                      transition: "transform 140ms ease",
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between" style={{ fontSize: 11.5, color: colors.textMuted }}>
                <span>{formatTime(shownPosition)}</span>
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
            </div>
          ) : (
            <div onScroll={onStageScroll} className="relative flex-1 min-h-0 overflow-y-auto flex flex-col lg:flex-row gap-8 px-6 md:px-10 pb-6">
              <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <div
                  onClick={toggle}
                  role="button"
                  aria-label={playing ? "Pause" : "Play"}
                  className="rounded-lg cursor-pointer"
                  style={{
                    height: "min(300px, 34vh)", aspectRatio: "1 / 1", width: "auto",
                    background: track?.artworkUrl ? `url(${track.artworkUrl}) center/cover no-repeat` : colors.bgElevated,
                    boxShadow: "0 30px 70px rgba(0,0,0,0.6)",
                  }}
                />
                {/* The slot the player is flown into, beside nothing and under
                    the artwork — visible, which is the condition it plays
                    under, and never below the 200px floor. */}
                <div
                  ref={playerSlotRef}
                  className="rounded-lg"
                  style={{ width: "min(560px, 90vw)", aspectRatio: "16 / 9", minHeight: 200, background: "#000" }}
                />
                <div className="text-center" style={{ maxWidth: 520 }}>
                  <div style={{ fontFamily: displayFont, fontSize: 26, fontWeight: 600, color: colors.text }} className="line-clamp-2">
                    {track?.title || "Nothing playing"}
                  </div>
                  <div style={{ fontSize: 15, color: colors.textMuted, marginTop: 6 }} className="truncate">
                    {track?.artist || ""}
                  </div>
                </div>
              </div>
              <div className="w-full lg:w-[340px] flex-shrink-0">
                {upNextHeading}
                {(queue.length ? queue : tracks || []).map(trackRow)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* The queue, as a sheet that comes up over the player.
          Pulled up by the handle or the label, pushed back down the same way.
          It leaves the artwork and the controls where they are instead of
          scrolling them off the top, which is what a music app does. */}
      {stageMounted && narrow && (
        <>
          {sheetOpen && (
            <div
              onClick={() => setSheetOpen(false)}
              className="fixed inset-0"
              style={{ background: "rgba(0,0,0,0.45)", zIndex: 56 }}
            />
          )}
          <div
            className="fixed left-0 right-0 flex flex-col"
            style={{
              bottom: NAV_HEIGHT,
              height: "72vh",
              background: colors.bgElevated,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderTop: `1px solid ${colors.ring}`,
              zIndex: 57,
              transform: sheetOpen ? "translateY(0)" : `translateY(calc(100% - ${SHEET_PEEK}px))`,
              transition: `transform ${STAGE_MS}ms cubic-bezier(.32,.72,0,1)`,
            }}
          >
            <button
              onClick={() => setSheetOpen((v) => !v)}
              aria-label={sheetOpen ? "Hide up next" : "Show up next"}
              className="w-full flex flex-col items-center gap-2"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "10px 0 12px" }}
            >
              <span style={{ width: 38, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.28)" }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.textMuted }}>
                Up next
              </span>
            </button>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
              {(queue.length ? queue : tracks || []).map(trackRow)}
            </div>
          </div>
        </>
      )}

      {/* The bar. Stays across every view, the way a music app's does. */}
      <div
        className="fixed left-0 right-0 flex items-center gap-4 px-3 md:px-6"
        style={{
          bottom: narrow ? NAV_HEIGHT : 0,
          // Only a phone hides it. A wide screen has room for the bar and the
          // stage at once, and a bar that slid away there would be movement for
          // its own sake.
          transform: !narrow || barVisible ? "translateY(0)" : `translateY(${BAR_HEIGHT + 8}px)`,
          transition: narrow ? "transform 260ms cubic-bezier(.32,.72,0,1)" : "none",
          height: BAR_HEIGHT,
          background: colors.bgElevated,
          borderTop: `1px solid ${colors.ring}`,
          zIndex: 58,
        }}
      >
        <div className="absolute left-0 right-0" {...scrubHandlers} style={{ top: -6, height: 12, paddingTop: 6, cursor: duration ? "pointer" : "default", touchAction: "none" }}>
          <div style={{ height: 3, background: "rgba(255,255,255,0.10)" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: colors.accent }} />
          </div>
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
              {buffering ? "Buffering…" : track?.artist || ""}
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
            ["history", "History", History],
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

          {/* The way back to the films. The rail has this on a wide screen and
              a phone had no way out of the music app at all. */}
          <Link
            to="/"
            className="flex-1 flex flex-col items-center justify-center gap-1"
            style={{ textDecoration: "none", color: colors.textMuted, fontFamily: bodyFont, fontSize: 10.5, fontWeight: 500 }}
          >
            <Film size={19} />
            Movies
          </Link>
        </div>
      )}
    </div>
  );
}