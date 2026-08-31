import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music } from "lucide-react";
import { colors, bodyFont, displayFont } from "../theme";
import AppNavbar from "../components/AppNavbar";
import api from "../api/client";

/*
 * The music player.
 *
 * Drives a real <audio> element against real track URLs from /music/tracks.
 * There is deliberately no simulated playback here: a player whose progress bar
 * moves while nothing is coming out of the speakers is the same mistake the
 * Creator Studio made, and that page was deleted for it. Until tracks are
 * added, this says so plainly.
 */

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MusicPage() {
  const [tracks, setTracks] = useState(null);
  const [genres, setGenres] = useState([]);
  const [genre, setGenre] = useState(null);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef(null);

  useEffect(() => {
    api
      .get("/music/genres")
      .then(setGenres)
      .catch((err) => console.error("fetchMusicGenres error:", err));
  }, []);

  useEffect(() => {
    setTracks(null);
    setCurrent(0);
    api
      .get(`/music/tracks?limit=100${genre ? `&genre=${encodeURIComponent(genre)}` : ""}`)
      .then(setTracks)
      .catch((err) => {
        console.error("fetchTracks error:", err);
        setError(err.message);
        setTracks([]);
      });
  }, [genre]);

  const track = tracks?.[current] || null;

  // Play state is driven from the element's own events rather than assumed, so
  // a failed load cannot leave the button showing "pause" over silence.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnded = () => setCurrent((i) => (tracks && i + 1 < tracks.length ? i + 1 : i));
    const onError = () => {
      setPlaying(false);
      setError("That track would not play.");
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [tracks]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (audio.paused) audio.play().catch(() => setError("That track would not play."));
    else audio.pause();
  };

  const skip = (delta) => {
    if (!tracks?.length) return;
    setCurrent((i) => Math.min(tracks.length - 1, Math.max(0, i + delta)));
    setPosition(0);
  };

  const seek = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const box = event.currentTarget.getBoundingClientRect();
    audio.currentTime = ((event.clientX - box.left) / box.width) * duration;
  };

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont }} className="w-full overflow-x-hidden">
      <AppNavbar />

      <div className="px-6 md:px-10 pt-8 pb-20 max-w-5xl mx-auto">
        <h1 style={{ fontFamily: displayFont, fontSize: "clamp(30px, 5vw, 44px)", fontWeight: 600, color: colors.text, letterSpacing: "-0.02em" }}>
          Music
        </h1>

        {genres.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {[{ genre: null, count: null }, ...genres].map(({ genre: g, count }) => (
              <button
                key={g || "all"}
                onClick={() => setGenre(g)}
                style={{
                  fontFamily: bodyFont, fontSize: 12.5, fontWeight: 600,
                  color: genre === g ? colors.text : colors.textMuted,
                  background: genre === g ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${colors.ring}`, borderRadius: 999,
                  padding: "6px 13px", cursor: "pointer",
                }}
              >
                {g || "All"}
                {count !== null && <span style={{ color: colors.textMuted, marginLeft: 6, fontWeight: 500 }}>{count}</span>}
              </button>
            ))}
          </div>
        )}

        {tracks === null ? (
          <div className="mt-8 space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 56, background: colors.bgElevated, borderRadius: 6 }} />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="mt-10" style={{ color: colors.textMuted, fontSize: 14, lineHeight: 1.7, maxWidth: 560 }}>
            <Music size={28} color={colors.textMuted} />
            <p className="mt-4">
              There is no music in the catalog yet. The player below is wired to real audio — it
              needs tracks with a URL to play, which nothing has added.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 rounded" style={{ background: colors.bgElevated, border: `1px solid ${colors.ring}`, padding: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: colors.text }}>{track?.title}</div>
              <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{track?.artist}</div>

              <div
                onClick={seek}
                className="mt-5"
                style={{ height: 5, background: "rgba(255,255,255,0.10)", borderRadius: 3, cursor: "pointer" }}
              >
                <div
                  style={{
                    height: "100%",
                    width: duration ? `${(position / duration) * 100}%` : 0,
                    background: colors.accent,
                    borderRadius: 3,
                  }}
                />
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
                <button
                  onClick={() => {
                    const audio = audioRef.current;
                    if (audio) audio.muted = !audio.muted;
                    setMuted((m) => !m);
                  }}
                  aria-label={muted ? "Unmute" : "Mute"}
                  style={{ background: "none", border: "none", cursor: "pointer", display: "flex", marginLeft: "auto" }}
                >
                  {muted ? <VolumeX size={18} color={colors.textMuted} /> : <Volume2 size={18} color={colors.textMuted} />}
                </button>
              </div>
            </div>

            <div className="mt-8">
              {tracks.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => { setCurrent(i); setPosition(0); }}
                  className="w-full flex items-center gap-3 text-left"
                  style={{ background: i === current ? "rgba(255,255,255,0.05)" : "none", border: "none", borderBottom: `1px solid ${colors.ring}`, padding: "12px 10px", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 12, color: colors.textMuted, width: 22 }}>{i + 1}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: colors.text, flex: 1 }} className="truncate">{t.title}</span>
                  <span style={{ fontSize: 12, color: colors.textMuted, marginLeft: 12 }} className="truncate max-w-[35%]">{t.artist}</span>
                  {t.durationSeconds ? (
                    <span style={{ fontSize: 11, color: colors.textMuted, marginLeft: 12 }}>{formatTime(t.durationSeconds)}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        )}

        {error && (
          <div className="mt-6" style={{ fontSize: 13, color: colors.textMuted }}>{error}</div>
        )}

        <audio ref={audioRef} src={track?.audioUrl} autoPlay={playing} preload="metadata" />
      </div>
    </div>
  );
}
