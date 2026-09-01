import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Play, Pause, SkipBack, SkipForward, Search, X, Music, Home, Compass,
  Library, Shuffle, Repeat, Volume2, VolumeX, ChevronDown, ChevronUp,
  Film, History, ArrowLeft, Clock, TrendingUp, Sparkles, ArrowUpLeft,
  ThumbsUp, ThumbsDown, Gauge, Link2, Unlink, Minus, Plus,
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
 *
 * Playback: one <audio> element, owned by this page.
 *
 * Tracks come from PeerTube, which hands out the media file itself, and the
 * file is fetched through our own /music/stream proxy. That is what makes the
 * rest of this page possible: the element keeps playing when a phone's screen
 * locks, it takes Media Session metadata to the lock screen, and the page can
 * change how it sounds.
 *
 * It replaced YouTube's embedded player, which could do none of those. A
 * cross-origin iframe is suspended when the page is hidden, takes only the
 * playback rates it advertises, pitch-corrects with no way to stop it, and
 * cannot be routed through Web Audio at all — and a good share of the
 * catalogue refused to play, because rights holders turn embedding off.
 *
 *
 * Tempo and pitch.
 *
 * `playbackRate` moves tempo, and `preservesPitch` decides whether pitch rides
 * along with it. Hooked is `preservesPitch = false`, so 1.2x is faster AND
 * higher, the way a record spun faster is. Unhooked with pitch at 100% is
 * `preservesPitch = true`: faster, same key. Those two are exact.
 *
 * A pitch that is neither 100% nor equal to the tempo needs real
 * time-stretching — a phase vocoder such as SoundTouch or Rubber Band. The
 * panel applies what it can and says the rest did not land, rather than moving
 * a knob that does nothing.
 */

const SEARCH_DEBOUNCE_MS = 500;

// The range the tempo and pitch sliders cover, and what Reset goes back to.
const RATE_MIN = 0.1;
const RATE_MAX = 3;
const RATE_STEPS = [
  ["1%", 0.01],
  ["5%", 0.05],
  ["10%", 0.1],
  ["25%", 0.25],
  ["100%", 1],
];

const clampRate = (v) =>
  Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(Number(v) * 100) / 100));

const sameRate = (a, b) => Math.abs(a - b) < 0.005;


/*
 * A real <audio> element behind the same interface.
 *
 * `setRates` is the interesting one. The element gives two knobs, not three:
 * `playbackRate` sets the tempo, and `preservesPitch` decides whether the pitch
 * is dragged along with it. So the pairs it can hit exactly are (tempo, tempo)
 * — hooked, the vinyl behaviour — and (tempo, 1) — unhooked with the pitch left
 * alone. Anything else is reported back as not applied.
 */
function mediaEngine(el) {
  return {
    el,
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
      const held = sameRate(pitch, 1);
      // preservesPitch off lets the pitch ride the rate; on holds it at the
      // original key. Prefixed spellings for the browsers still on them.
      const preserve = !hooked;
      el.playbackRate = tempo;
      el.preservesPitch = preserve;
      if ("mozPreservesPitch" in el) el.mozPreservesPitch = preserve;
      if ("webkitPreservesPitch" in el) el.webkitPreservesPitch = preserve;
      return { tempo, pitch: hooked ? tempo : 1, exact: hooked || held };
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

// What the engine is asked to load. A track that carries its own audio gives a
// URL here, and that is also what picks the engine; a YouTube one gives the
// video id, which is what its player wants.
// The API is its own deployment, so a relative path would ask the frontend's
// own host for the bytes and be handed the SPA's index.html.
const STREAM_BASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/music/stream`;

/*
 * Where the bytes come from. A track may carry its own `streamUrl`; otherwise
 * it is fetched through our proxy by id, which is what a PeerTube track needs —
 * the file lives on whichever instance published it and the proxy resolves it.
 */
function sourceOf(track) {
  if (!track) return "";
  if (track.streamUrl) return track.streamUrl;
  if (!track.sourceId) return "";
  return `${STREAM_BASE}/${encodeURIComponent(track.sourceId)}`;
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

/* "SonyMusicIndiaVEVO" is a channel name, not something to read in a heading. */
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
  const [engineReady, setEngineReady] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  /*
   * Tempo, pitch, and whether they are tied together.
   *
   * Both are multipliers on the original: 1 is the song as recorded. Hooked —
   * `unhook` false, which is the default — is the record-player relationship,
   * where turning one turns the other, so faster is also higher. Unhooked lets
   * them be set apart, which is the whole reason the switch exists.
   */
  const [tempo, setTempo] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [unhook, setUnhook] = useState(false);
  const [rateStep, setRateStep] = useState(0.05);
  const [ratesOpen, setRatesOpen] = useState(false);
  // What the panel was showing when it opened, so Cancel has somewhere to go.
  const [ratesBefore, setRatesBefore] = useState(null);
  // Set when the engine could not do exactly what was asked, so the panel can
  // say so instead of leaving a knob that looks like it worked.
  const [rateNote, setRateNote] = useState(null);

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

  // `audioRef` is whichever engine is currently in charge; the two below are
  // the engines themselves, each built once.
  const audioRef = useRef(null);
  const mediaEngineRef = useRef(null);
  const mediaElRef = useRef(null);
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

  // Which engine this track belongs to, and therefore what the panel can offer.
  // Derived from the track rather than read off the ref, so the UI re-renders
  // when it changes.
  // Every track is a file served through our own proxy now, so the media
  // element is always the engine — which is what makes pitch possible at all.
  const onMedia = true;
  const canPitch = onMedia;

  /* One engine now; kept as a function so callers read the same as before. */
  const selectEngine = () => {
    if (mediaEngineRef.current) audioRef.current = mediaEngineRef.current;
    return audioRef.current;
  };

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
   * Point the engine at a song.
   *
   * `dataset.sourceId` is the record of what is loaded, and it is checked before
   * touching the source: assigning the same URL again restarts the song from
   * zero. Each engine keeps its own dataset, so switching between them counts
   * as a change and reloads, which is what should happen.
   *
   * A load without `autoplay` deliberately does not call play() — opening the
   * page should be silent, and a search should not start something nobody asked
   * for.
   */
  useEffect(() => {
    if (!track) return;
    const audio = selectEngine(track);
    if (!audio) return;
    const source = sourceOf(track);
    if (!source) {
      setError("No audio for that one yet.");
      return;
    }
    if (audio.dataset.sourceId !== String(source)) {
      audio.dataset.sourceId = String(source);
      audio.setSource(source, { autoplay });
      // Rates set for one song should carry to the next rather than quietly
      // snapping back to normal partway through a listen.
      if (!sameRate(tempo, 1) || !sameRate(pitch, 1)) {
        applyRates(audio, tempo, audio.canPitch ? pitch : 1);
      }
    }
    if (autoplay && audio.paused) {
      audio.play().catch((err) => {
        // A rejected play() here is almost always the autoplay policy: the
        // browser wants the next start to come from a tap. Not an error worth
        // shouting about.
        console.warn("play() rejected:", err?.name || err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.sourceId, track?.streamUrl, autoplay, engineReady]);

  useEffect(() => {
    if (!track || !autoplay) return;
    rememberRecent(track);
    setRecent(readRecent());
    setLiked(null);
  }, [track?.sourceId, autoplay, track]);

  // Repeat is the engine's own loop flag rather than something reimplemented on
  // `ended` — looping this way has no gap and no second network trip.
  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = repeat;
  }, [repeat]);

  /*
   * The <audio> engine, built once, with the events the page listens to.
   *
   * These fire only while it is the engine in charge, since it is the only one
   * that is ever told to play.
   */
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
        setError("That file would not play.");
      }],
    ];
    for (const [event, handler] of handlers) el.addEventListener(event, handler);
    setEngineReady((n) => n + 1);
    return () => {
      for (const [event, handler] of handlers) el.removeEventListener(event, handler);
    };
  }, []);



  // Neither engine reports progress often enough to drive a scrubber, so the
  // one in charge is asked.
  useEffect(() => {
    const timer = setInterval(() => {
      const audio = audioRef.current;
      if (document.hidden || !audio) return;
      setPosition(audio.currentTime || 0);
      const d = audio.duration || 0;
      if (d) setDuration(d);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  /*
   * Lock-screen and notification controls.
   *
   * The metadata is what the phone shows on the lock screen, and these handlers
   * are the buttons on it.
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
          // The OS scrubber runs on wall-clock time, so it needs the rate the
          // song is actually moving at, not 1.
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
          setVolume(audio.volume);
          if (audio.muted) {
            audio.muted = false;
            setMuted(false);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          audio.volume = Math.max(0, audio.volume - 0.1);
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
   * The source is assigned and play() is called right here, inside the handler
   * for the gesture that asked for it. That is not a stylistic choice: iOS only
   * counts a play() as user-initiated if it happens synchronously in the
   * gesture, and the first one in the page's life is the one that unlocks audio
   * for every later start — including the ones the queue makes on its own with
   * the screen off. Setting state and letting an effect play a tick later is
   * exactly the shape that leaves iOS silent.
   */
  const play = (t) => {
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
    audio.play()?.catch?.((err) => console.warn("play() rejected:", err?.name || err));
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
  // engine loops itself and never fires `ended`.
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
   * The engine is only told the new time when the drag ends: writing
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

  /*
   * Tempo and pitch.
   *
   * One place decides what the pair should be, tells the engine, and then takes
   * the engine's answer as the truth — because the engine may not have been
   * able to do what was asked. YouTube snaps the tempo to a rate it knows; the
   * <audio> element cannot hold a pitch that is neither the tempo nor the
   * original. Storing what was requested instead of what happened is how a
   * slider ends up sitting somewhere the sound is not.
   */
  const commitRates = (nextTempo, nextPitch) => {
    const audio = audioRef.current;
    const wantTempo = clampRate(nextTempo);
    const wantPitch = clampRate(nextPitch);
    const applied = applyRates(audio, wantTempo, audio?.canPitch ? wantPitch : 1);

    if (!applied) {
      // Nothing is loaded yet. Keep the choice; the load effect applies it.
      setTempo(wantTempo);
      setPitch(wantPitch);
      setRateNote(null);
      return;
    }

    setTempo(applied.tempo);
    setPitch(applied.pitch);

    if (applied.exact && sameRate(applied.tempo, wantTempo)) {
      setRateNote(null);
    } else if (!audio.canPitch) {
      setRateNote(
        `YouTube only plays at the rates it offers, so the tempo snapped to ${applied.tempo}x. ` +
          "It also corrects pitch itself and gives no way to turn that off."
      );
    } else if (!sameRate(applied.tempo, wantTempo)) {
      setRateNote(`Tempo landed on ${applied.tempo}x.`);
    } else {
      setRateNote(
        "A pitch that is neither the original nor the tempo needs a time-stretcher " +
          "(SoundTouch, Rubber Band). Pitch is held at 100% until one is wired in."
      );
    }
  };

  /*
   * Hooked, the default, is the record-player relationship: one knob, two
   * things move. Unhooked lets the tempo go without the pitch — the reason
   * anyone opens this panel.
   */
  const onTempoChange = (value) => {
    if (!canPitch) return commitRates(value, 1);
    return commitRates(value, unhook ? pitch : value);
  };

  const onPitchChange = (value) => {
    if (!canPitch) return;
    return commitRates(unhook ? tempo : value, value);
  };

  const onUnhookChange = (on) => {
    setUnhook(on);
    // Hooking back up has to reconcile the two, or the switch would leave them
    // apart while claiming they are tied. The tempo is what wins.
    if (!on) commitRates(tempo, tempo);
  };

  const openRates = () => {
    setRatesBefore({ tempo, pitch, unhook });
    setRateNote(null);
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
    // Dragging away from zero should unmute, or the slider does nothing.
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

  // Bound handlers read the current versions from here.
  actionsRef.current = { toggle, skip, resume, ended: onEnded };

  // While a finger is down the bar follows the finger, not the audio.
  const shownPosition = scrubbing ?? position;
  const progress = duration ? (shownPosition / duration) * 100 : 0;
  const list = searchActive && searchMode === "albums" ? albums : tracks;
  const ratesTouched = !sameRate(tempo, 1) || !sameRate(pitch, 1);

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

  /*
   * One row of the tempo/pitch panel: the label and current value over a
   * slider, with a nudge button at each end that moves by the chosen step.
   */
  const rateRow = ({ label, value, display, onChange, disabled }) => (
    <div style={{ padding: "12px 0" }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.textMuted }}>
          {label}
        </span>
        <span style={{ fontFamily: displayFont, fontSize: 19, fontWeight: 700, color: disabled ? colors.textMuted : colors.text, fontVariantNumeric: "tabular-nums" }}>
          {display}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(value - rateStep)}
          disabled={disabled}
          aria-label={`${label} down`}
          style={{ background: "none", border: "none", cursor: disabled ? "default" : "pointer", display: "flex", color: colors.textMuted, opacity: disabled ? 0.4 : 1, padding: 2 }}
        >
          <Minus size={16} />
        </button>
        <input
          type="range"
          min={RATE_MIN}
          max={RATE_MAX}
          step={0.01}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className="onion-rate"
        />
        <button
          onClick={() => onChange(value + rateStep)}
          disabled={disabled}
          aria-label={`${label} up`}
          style={{ background: "none", border: "none", cursor: disabled ? "default" : "pointer", display: "flex", color: colors.textMuted, opacity: disabled ? 0.4 : 1, padding: 2 }}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex items-center justify-between" style={{ fontSize: 11, color: colors.textMuted, marginTop: 3, paddingLeft: 27, paddingRight: 27 }}>
        <span>{label === "Tempo" ? `${RATE_MIN}x` : `${RATE_MIN * 100}%`}</span>
        <span>{label === "Tempo" ? `${RATE_MAX}x` : `${RATE_MAX * 100}%`}</span>
      </div>
    </div>
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
       * The <audio> engine. Hidden, but a real element the page owns — which is
       * what makes tempo and pitch possible at all, and what will keep playing
       * with the screen off once tracks carry their own audio.
       */}
      <audio ref={mediaElRef} preload="metadata" playsInline style={{ display: "none" }} />



      <style>{`
        /*
         * The ring around the search field is the browser's, not ours, and it
         * is drawn on whichever element takes focus — so it is turned off on
         * the field, on the box around it, and on whatever inside it might take
         * focus next. Turning it off on the element alone kept losing.
         */
        .onion-search, .onion-search *, .onion-search:focus-within {
          outline: none !important;
          box-shadow: none !important;
          -webkit-tap-highlight-color: transparent;
        }
        .onion-search input:focus,
        .onion-search input:focus-visible { outline: none !important; }

        .onion-volume {
          width: 0;
          opacity: 0;
          margin-left: 0;
          height: 4px;
          appearance: none;
          -webkit-appearance: none;
          background: rgba(255,255,255,0.22);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
          transition: width 220ms cubic-bezier(.32,.72,0,1), opacity 180ms ease, margin-left 220ms ease;
        }
        .group\\/vol:hover .onion-volume,
        .onion-volume:focus-visible { width: 84px; opacity: 1; margin-left: 10px; }
        .onion-volume::-webkit-slider-thumb {
          appearance: none; -webkit-appearance: none;
          width: 11px; height: 11px; border-radius: 50%;
          background: #fff; cursor: pointer;
        }
        .onion-volume::-moz-range-thumb {
          width: 11px; height: 11px; border: none; border-radius: 50%;
          background: #fff; cursor: pointer;
        }

        /* Tempo and pitch. Wide enough to aim with, and a thumb big enough to
           catch on a touchscreen. */
        .onion-rate {
          flex: 1;
          height: 4px;
          appearance: none;
          -webkit-appearance: none;
          background: rgba(255,255,255,0.18);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
          touch-action: none;
        }
        .onion-rate::-webkit-slider-thumb {
          appearance: none; -webkit-appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: ${colors.accent}; cursor: pointer;
        }
        .onion-rate::-moz-range-thumb {
          width: 16px; height: 16px; border: none; border-radius: 50%;
          background: ${colors.accent}; cursor: pointer;
        }
        .onion-rate:disabled { opacity: 0.35; cursor: not-allowed; }
        .onion-rate:disabled::-webkit-slider-thumb { background: ${colors.textMuted}; cursor: not-allowed; }
        .onion-rate:disabled::-moz-range-thumb { background: ${colors.textMuted}; cursor: not-allowed; }

        @keyframes onion-search-in {
          from { opacity: 0; transform: translateY(-6px) scaleX(0.94); }
          to { opacity: 1; transform: none; }
        }
        @keyframes onion-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes onion-panel-in {
          from { opacity: 0; transform: translate(-50%, 14px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

      {/* Rail */}
      <div
        className="hidden md:flex flex-col gap-1 fixed left-0 top-0 bottom-0 px-3 pt-4"
        style={{ width: RAIL_WIDTH, borderRight: `1px solid ${colors.ring}`, zIndex: 30, background: colors.bg }}
      >
        {/* The mark, and "music" drawn in the same letterforms as the logo — not
            set in a typeface next to it. The word "onion" is gone: the mark
            already says it, and saying it twice made the lockup a mouthful. */}
        <Link to="/music" className="flex items-center gap-1" style={{ textDecoration: "none", marginBottom: 10, paddingLeft: 2 }}>
          <OnionMark height={86} />
          <BrandWord word="music" height={19} />
        </Link>
        {railItem("home", "Home", Home)}
        {railItem("explore", "Explore", Compass)}
        {railItem("history", "History", History)}
        {railItem("library", "Library", Library)}
        <div style={{ borderTop: `1px solid ${colors.ring}`, margin: "14px 8px" }} />
        <Link to="/" style={{ fontSize: 13, color: colors.textMuted, textDecoration: "none", padding: "8px 14px" }}>
          ← Movies &amp; series
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
                <BrandWord word="music" height={14} />
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
            <div className="onion-search flex items-center gap-3 px-4 py-2.5 rounded w-full mx-auto"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: `1px solid ${colors.ring}`,
                maxWidth: 620,
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
                  color: colors.text,
                  fontSize: 14.5,
                  // Both, and inline: the browser draws its own ring on a
                  // focused field, and Tailwind's outline-none was losing to it.
                  outline: "none",
                  boxShadow: "none",
                  border: "none",
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
                      background: "rgba(255,255,255,0.06)",
                      border: `1px solid ${colors.ring}`,
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
              {!searchActive && forYou.length > 0 && cardRow(`Because you listened to ${channelLabel(recent[0]?.artist)}`, forYou)}
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

      {/* The now-playing stage, opened from the bar. Artwork, controls and the
          queue — the player itself is not part of it. */}
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
            {/* Tempo and pitch are reachable from the stage too, since that is
                where someone is listening closely enough to want them. */}
            <button
              onClick={openRates}
              aria-label="Tempo and pitch"
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: ratesTouched ? colors.accentLight : colors.textMuted }}
            >
              <Gauge size={22} />
            </button>
          </div>

          {narrow ? (
            /* A phone: one column, the artwork in the middle of it, controls
               large enough for a thumb, and the queue underneath. */
            <div onScroll={onStageScroll} className="relative flex-1 min-h-0 overflow-y-auto px-5 pb-6 flex flex-col">
              <div className="flex justify-center py-4">
                <div
                  onClick={toggle}
                  role="button"
                  aria-label={playing ? "Pause" : "Play"}
                  className="rounded-lg cursor-pointer"
                  style={{
                    // The video used to take the 200px under this. With it gone
                    // the artwork gets the room it wants.
                    width: "min(300px, 74vw)", aspectRatio: "1 / 1",
                    background: track?.artworkUrl ? `url(${track.artworkUrl}) center/cover no-repeat` : colors.bgElevated,
                    boxShadow: "0 26px 60px rgba(0,0,0,0.6)",
                  }}
                />
              </div>

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
            // Two columns that scroll independently. The artwork and the
            // controls stay put — they are what someone is looking at — and
            // only the queue moves under them.
            <div className="relative flex-1 min-h-0 flex flex-col lg:flex-row gap-8 px-6 md:px-10 pb-6">
              <div className="flex-1 flex flex-col items-center justify-center gap-6 min-h-0">
                <div
                  onClick={toggle}
                  role="button"
                  aria-label={playing ? "Pause" : "Play"}
                  className="rounded-lg cursor-pointer"
                  style={{
                    // Was capped at 34vh to leave room for the video underneath.
                    height: "min(430px, 52vh)", aspectRatio: "1 / 1", width: "auto",
                    background: track?.artworkUrl ? `url(${track.artworkUrl}) center/cover no-repeat` : colors.bgElevated,
                    boxShadow: "0 30px 70px rgba(0,0,0,0.6)",
                  }}
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

              <div className="w-full lg:w-[340px] flex-shrink-0 flex flex-col min-h-0">
                {upNextHeading}
                <div onScroll={onStageScroll} className="flex-1 min-h-0 overflow-y-auto pr-1">
                  {(queue.length ? queue : tracks || []).map(trackRow)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* The queue, as a sheet that comes up over the stage. Pulled up by the
          handle or the label, pushed back down the same way. It leaves the
          artwork and the controls where they are instead of scrolling them off
          the top, which is what a music app does. */}
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

      {/*
       * Tempo and pitch.
       *
       * Hooked — the default — is one knob wearing two labels: turning either
       * turns the other, which is the record-player relationship and what most
       * people mean by "play it faster". Unhook separates them, which is the
       * only reason to open this at all: a song sped up for practice that has
       * not also gone sharp.
       *
       * Everything the panel cannot do on the current engine is disabled with
       * the reason under it, rather than left live and inert.
       */}
      {ratesOpen && (
        <>
          <div onClick={cancelRates} className="fixed inset-0" style={{ background: "rgba(0,0,0,0.55)", zIndex: 70 }} />
          <div
            className="fixed rounded-xl"
            style={{
              left: "50%",
              bottom: narrow ? NAV_HEIGHT + 12 : BAR_HEIGHT + 14,
              width: "min(540px, 94vw)",
              maxHeight: "78vh",
              overflowY: "auto",
              background: colors.bgElevated,
              border: `1px solid ${colors.ring}`,
              boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
              zIndex: 71,
              padding: "16px 20px 14px",
              animation: "onion-panel-in 200ms cubic-bezier(.32,.72,0,1)",
            }}
          >
            {rateRow({
              label: "Tempo",
              value: tempo,
              display: `${tempo.toFixed(2)}x`,
              onChange: onTempoChange,
              disabled: false,
            })}

            <div style={{ borderTop: `1px solid ${colors.ring}` }} />

            {rateRow({
              label: "Pitch",
              value: pitch,
              display: `${Math.round(pitch * 100)}%`,
              onChange: onPitchChange,
              disabled: !canPitch,
            })}

            <div style={{ borderTop: `1px solid ${colors.ring}` }} />

            {/* How far a nudge button moves, and how coarse the sliders feel. */}
            <div className="flex items-center gap-2 flex-wrap" style={{ padding: "12px 0" }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.textMuted, marginRight: 4 }}>
                Step
              </span>
              {RATE_STEPS.map(([label, value]) => (
                <button
                  key={label}
                  onClick={() => setRateStep(value)}
                  style={{
                    fontFamily: bodyFont, fontSize: 12.5, fontWeight: 600,
                    color: rateStep === value ? colors.bg : colors.text,
                    background: rateStep === value ? colors.text : "rgba(255,255,255,0.07)",
                    border: `1px solid ${colors.ring}`, borderRadius: 999,
                    padding: "5px 13px", cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ borderTop: `1px solid ${colors.ring}` }} />

            {/* The switch this panel exists for. */}
            <button
              onClick={() => onUnhookChange(!unhook)}
              disabled={!canPitch}
              className="w-full flex items-start gap-3 text-left"
              style={{
                background: "none", border: "none", padding: "13px 0",
                cursor: canPitch ? "pointer" : "not-allowed", opacity: canPitch ? 1 : 0.5,
              }}
            >
              <span
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: 21, height: 21, borderRadius: 5, marginTop: 1,
                  border: `1.5px solid ${unhook ? colors.accent : colors.ring}`,
                  background: unhook ? colors.accent : "transparent",
                }}
              >
                {unhook ? <Unlink size={13} color="#fff" /> : <Link2 size={13} color={colors.textMuted} />}
              </span>
              <span className="min-w-0">
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: colors.text }}>
                  Unhook tempo from pitch
                </span>
                <span style={{ display: "block", fontSize: 12.5, color: colors.textMuted, marginTop: 3, lineHeight: 1.5 }}>
                  {unhook
                    ? "Set apart. Speed can change without the key going with it."
                    : "Tied together, like a record spun faster — moving one moves the other."}
                </span>
              </span>
            </button>

            {/* Whatever the engine could not do, said out loud. */}
            {(rateNote || !canPitch) && (
              <div
                className="rounded"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${colors.ring}`,
                  padding: "10px 12px",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: colors.textMuted,
                  marginBottom: 4,
                }}
              >
                {rateNote ||
                  "This track plays through YouTube, which corrects pitch itself and gives no way " +
                    "to turn that off — and its audio sits in a cross-origin frame that no pitch " +
                    "shifter can reach. Tempo only here, snapped to the rates YouTube offers."}
              </div>
            )}

            <div className="flex items-center justify-between" style={{ paddingTop: 10 }}>
              <button
                onClick={resetRates}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: bodyFont, fontSize: 13.5, fontWeight: 700, letterSpacing: "0.06em", color: colors.textMuted, padding: "8px 2px" }}
              >
                RESET
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelRates}
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: bodyFont, fontSize: 13.5, fontWeight: 700, letterSpacing: "0.06em", color: colors.textMuted, padding: "8px 14px" }}
                >
                  CANCEL
                </button>
                <button
                  onClick={() => { setRatesOpen(false); setRateNote(null); }}
                  className="rounded"
                  style={{ background: colors.accent, border: "none", cursor: "pointer", fontFamily: bodyFont, fontSize: 13.5, fontWeight: 700, letterSpacing: "0.06em", color: "#fff", padding: "8px 20px" }}
                >
                  OKAY
                </button>
              </div>
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

          {/* Volume: the button mutes, the slider that slides out of it sets the
              level. Hidden until the group is hovered, so it costs no width
              until someone reaches for it. */}
          <div className="hidden sm:flex items-center group/vol">
            <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, display: "flex" }}>
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
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

          {/* Tempo and pitch. The reading is the tempo, since that is the one
              that is always live; the dial goes accent when either is off 1. */}
          <button
            onClick={openRates}
            aria-label="Tempo and pitch"
            className="flex items-center gap-1.5"
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: bodyFont, fontSize: 12.5, fontWeight: 700,
              color: ratesTouched ? colors.accentLight : colors.textMuted,
            }}
          >
            <Gauge size={17} />
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{tempo.toFixed(2)}x</span>
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
          {/* The way back to the films. The rail has this on a wide screen and a
              phone had no way out of the music app at all. */}
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