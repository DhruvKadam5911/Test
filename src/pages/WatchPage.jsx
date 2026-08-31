import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Play, Pause, Volume2, VolumeX, Maximize2, ThumbsUp, ListVideo, X, RefreshCw } from "lucide-react";
import { colors, bodyFont, displayFont, resolveBackground } from "../theme";
import SmallRing from "../components/shared/SmallRing";
import OnionLogo from "../components/shared/OnionLogo";
import AppNavbar from "../components/AppNavbar";
import api from "../api/client";
import SplashWheel from "../components/SplashWheel";

// The ident is designed at 104; inside a 16:9 player box that is far too big,
// and everything in the wheel scales from this one number.
const IDENT_ITEM_HEIGHT = 76;

function parseDurationToSeconds(durationMinutes) {
  if (!durationMinutes || isNaN(durationMinutes)) return 2880;
  return Number(durationMinutes) * 60;
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (num) => String(num).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function WatchPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();

  const [titleData, setTitleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [playbackError, setPlaybackError] = useState(null);
  // A resolved stream held back while the brand ident plays. The video is not
  // mounted until the ident finishes, so its audio cannot start underneath it.
  const [pendingPlaybackUrl, setPendingPlaybackUrl] = useState(null);

  const [recommendations, setRecommendations] = useState([]);
  const [liked, setLiked] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [btnActive, setBtnActive] = useState(false);

  // Series Overlay Panel State
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);
  const [activeEpisodeIdx, setActiveEpisodeIdx] = useState(0);

  // Scrubber State
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringBar, setIsHoveringBar] = useState(false);
  const [hoverTimeSec, setHoverTimeSec] = useState(0);
  const [hoverXPos, setHoverXPos] = useState(0);
  const scrubberRef = useRef(null);
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  // The element's real duration, once it has metadata. The catalog's
  // durationMinutes is only an estimate and is often a minute or two out.
  const [videoDurationSec, setVideoDurationSec] = useState(0);

  // Fetch Title Details from API
  const fetchTitleDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/titles/${videoId}`);
      setTitleData(data);
      setSelectedSeasonIdx(0);
      setActiveEpisodeIdx(0);

      // Fetch recommendations matching genre
      if (data.genre) {
        const recs = await api.get(`/titles?genre=${encodeURIComponent(data.genre)}&limit=6`);
        setRecommendations(recs.filter((r) => r.id !== data.id));
      }
    } catch (err) {
      console.error("fetchTitleDetails error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    fetchTitleDetails();
  }, [videoId]);

  const isSeries = titleData?.contentType === "series";
  const activeSeason = isSeries && titleData?.seasons ? titleData.seasons[selectedSeasonIdx] : null;
  const activeEpisode = activeSeason ? activeSeason.episodes[activeEpisodeIdx] : null;

  const durationMinutes = isSeries && activeEpisode ? activeEpisode.durationMinutes : titleData?.durationMinutes || 48;
  const durationSec = videoDurationSec || parseDurationToSeconds(durationMinutes);

  const currentDisplayTitle = isSeries && activeEpisode ? activeEpisode.title : titleData?.title;
  const currentDisplayDescription = isSeries && activeEpisode ? activeEpisode.description : titleData?.description;

  // Fetch Playback URL
  const fetchPlaybackUrl = async () => {
    setPlaybackError(null);
    try {
      let endpoint = `/titles/${videoId}/playback`;
      if (isSeries && activeEpisode) {
        endpoint += `?episodeId=${activeEpisode.id}`;
      }
      const data = await api.get(endpoint);
      // Hand it to the ident rather than the player; onDone starts the video.
      setPendingPlaybackUrl(data.playbackUrl);
    } catch (err) {
      console.error("fetchPlaybackUrl error:", err);
      setPlaybackError(err.message || "Couldn't start playback.");
    }
  };

  // Clearing the URL first matters: retrying usually resolves to the same
  // stream, and React would not remount the element for an unchanged src.
  const retryPlayback = () => {
    setPlaybackError(null);
    setPlaybackUrl(null);
    setPendingPlaybackUrl(null);
    setIsPlaying(false);
    fetchPlaybackUrl();
  };

  // The element failing is a separate failure from the request failing, and it
  // is the one a viewer actually hits — an unreachable or unsupported stream
  // otherwise leaves a silent black box.
  const handleVideoError = (e) => {
    const code = e.currentTarget.error?.code;
    const message =
      code === 2
        ? "Lost connection to the stream."
        : code === 3
        ? "This stream is corrupted or in an unsupported format."
        : code === 4
        ? "This stream could not be loaded."
        : "Playback failed.";
    console.error("video element error:", code, e.currentTarget.error?.message);
    setIsPlaying(false);
    setPlaybackError(message);
  };

  // Reset playback position on episode change
  useEffect(() => {
    setCurrentTimeSec(0);
    setVideoDurationSec(0);
    setPlaybackUrl(null);
    setPendingPlaybackUrl(null);
    setPlaybackError(null);
    setIsPlaying(false);
  }, [activeEpisodeIdx, selectedSeasonIdx, videoId]);

  // Preview-only timer. Once a stream is loaded the <video> element drives the
  // scrubber through timeupdate, so this must not run alongside it or the two
  // fight over currentTimeSec.
  useEffect(() => {
    let interval = null;
    if (isPlaying && !isDragging && !playbackUrl) {
      interval = setInterval(() => {
        setCurrentTimeSec((prev) => {
          if (prev >= durationSec) {
            setIsPlaying(false);
            return durationSec;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, isDragging, durationSec, playbackUrl]);

  // Every path that moves the playhead goes through here, so the bar and the
  // element can never disagree about where we are.
  const seekTo = (sec) => {
    setCurrentTimeSec(sec);
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(sec, video.duration);
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) {
      // No stream yet — this is the poster preview, so just move the mock.
      setIsPlaying((p) => !p);
      return;
    }
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  };

  const toggleFullscreen = () => {
    const el = playerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  };

  // Scrubber Event Handlers
  const calculateSecFromX = (clientX) => {
    if (!scrubberRef.current) return 0;
    const rect = scrubberRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = rect.width > 0 ? offsetX / rect.width : 0;
    return { sec: Math.round(pct * durationSec), pct: pct * 100, offsetX };
  };

  const handleScrubberMouseDown = (e) => {
    setIsDragging(true);
    const { sec, offsetX } = calculateSecFromX(e.clientX);
    seekTo(sec);
    setHoverTimeSec(sec);
    setHoverXPos(offsetX);
  };

  const handleScrubberMouseMove = (e) => {
    if (!scrubberRef.current) return;
    const { sec, offsetX } = calculateSecFromX(e.clientX);
    setHoverTimeSec(sec);
    setHoverXPos(offsetX);
    if (isDragging) {
      seekTo(sec);
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (isDragging) {
        const { sec, offsetX } = calculateSecFromX(e.clientX);
        seekTo(sec);
        setHoverTimeSec(sec);
        setHoverXPos(offsetX);
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isDragging, durationSec]);

  const progressPct = Math.max(0, Math.min((currentTimeSec / durationSec) * 100, 100));

  if (loading) {
    return (
      <div style={{ background: colors.bg, minHeight: "100vh", color: colors.text, fontFamily: bodyFont }} className="p-10 space-y-8 animate-pulse">
        <div style={{ height: 38, width: 140, background: colors.bgElevated, borderRadius: 6 }} />
        <div className="aspect-video max-w-5xl mx-auto rounded-lg" style={{ background: colors.bgElevated }} />
      </div>
    );
  }

  if (error || !titleData) {
    return (
      <div style={{ background: colors.bg, minHeight: "100vh", color: colors.text, fontFamily: bodyFont }} className="flex flex-col items-center justify-center p-10 space-y-4 text-center">
        <h2 style={{ fontFamily: displayFont, fontSize: 24 }}>Title Not Found</h2>
        <p style={{ color: colors.textMuted }}>{error || "Unable to load title details."}</p>
        <button onClick={fetchTitleDetails} className="px-4 py-2 rounded font-semibold text-xs flex items-center gap-2" style={{ background: colors.accent, color: "#fff" }}>
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont, color: colors.text }} className="w-full overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
        ::-webkit-scrollbar { display: none; }
      `}</style>

      <AppNavbar />

      {/* Main Watch Layout */}
      <div className="px-6 md:px-10 py-6 max-w-7xl mx-auto w-full min-w-0 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full min-w-0 items-start">

          {/* Left Column: Video Player & Info */}
          <div className="lg:col-span-8 w-full min-w-0 space-y-6">

            {/* 16:9 Video Player */}
            <div ref={playerRef} className="relative aspect-video rounded-lg overflow-hidden flex items-center justify-center w-full select-none" style={{ background: resolveBackground(titleData.thumbnailUrl), border: `1px solid ${colors.ring}` }}>

              {/* Once a stream is loaded the element is the source of truth for
                  time, duration and play state — the bar below reflects it.
                  Native controls are off because that bar replaces them. */}
              {playbackUrl ? (
                <video
                  ref={videoRef}
                  src={playbackUrl}
                  autoPlay
                  playsInline
                  muted={isMuted}
                  className="w-full h-full object-cover"
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d) && d > 0) setVideoDurationSec(d);
                  }}
                  onTimeUpdate={(e) => {
                    // Dragging owns the playhead until the user lets go.
                    if (!isDragging) setCurrentTimeSec(e.currentTarget.currentTime);
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onError={handleVideoError}
                  onClick={togglePlay}
                />
              ) : pendingPlaybackUrl ? null : (
                <>
                  {/* Centered Play Button */}
                  <button
                    onClick={fetchPlaybackUrl}
                    onMouseEnter={() => setBtnHover(true)}
                    onMouseLeave={() => { setBtnHover(false); setBtnActive(false); }}
                    onMouseDown={() => setBtnActive(true)}
                    onMouseUp={() => setBtnActive(false)}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      background: colors.accent,
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      boxShadow: btnHover ? "0 6px 20px rgba(124,63,196,0.55)" : "0 4px 16px rgba(124,63,196,0.4)",
                      transform: btnActive ? "scale(0.95)" : btnHover ? "scale(1.08)" : "scale(1)",
                      transition: "transform 180ms ease, box-shadow 180ms ease"
                    }}
                  >
                    <Play size={26} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
                  </button>

                  {/* Edge Trigger Tab */}
                  <button
                    onClick={() => setIsOverlayOpen(!isOverlayOpen)}
                    className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md"
                    style={{ background: isOverlayOpen ? colors.accent : "rgba(13,10,18,0.75)", color: "#fff", border: `1px solid ${colors.ring}` }}
                  >
                    <ListVideo size={14} />
                    <span>{isSeries ? "Episodes" : "More Like This"}</span>
                  </button>
                </>
              )}

              {/* SLIDING OVERLAY PANEL */}
              {isOverlayOpen && !playbackUrl && (
                <div
                  className="absolute top-0 right-0 bottom-12 z-20 w-full sm:w-[350px] md:w-[380px] p-4 flex flex-col backdrop-blur-md transition-all duration-300"
                  style={{ background: "rgba(13,10,18,0.94)", borderLeft: `1px solid ${colors.ring}` }}
                >
                  <div className="flex items-center justify-between pb-3 mb-3" style={{ borderBottom: `1px solid ${colors.ring}` }}>
                    {isSeries ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedSeasonIdx}
                          onChange={(e) => { setSelectedSeasonIdx(Number(e.target.value)); setActiveEpisodeIdx(0); }}
                          style={{ background: "rgba(255,255,255,0.08)", color: colors.text, fontFamily: bodyFont, fontSize: 13, fontWeight: 700, padding: "5px 10px", borderRadius: 4, border: `1px solid ${colors.ring}`, outline: "none" }}
                        >
                          {titleData.seasons.map((s, idx) => (
                            <option key={idx} value={idx} style={{ background: colors.bgCard, color: colors.text }}>Season {s.seasonNumber}</option>
                          ))}
                        </select>
                        <span style={{ fontSize: 11, fontWeight: 700, color: colors.accentLight }}>{activeSeason?.episodes?.length} EPISODES</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <SmallRing />
                        <span style={{ fontSize: 13, fontWeight: 700, color: colors.text, textTransform: "uppercase" }}>More Like This</span>
                      </div>
                    )}

                    <button
                      onClick={() => setIsOverlayOpen(false)}
                      style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      <X size={14} color={colors.text} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 pr-1" style={{ scrollbarWidth: "none" }}>
                    {isSeries ? (
                      activeSeason?.episodes.map((ep, idx) => {
                        const isCurrent = idx === activeEpisodeIdx;
                        return (
                          <div
                            key={ep.id || idx}
                            onClick={() => { setActiveEpisodeIdx(idx); setPlaybackUrl(null); }}
                            className="flex gap-3 p-2 rounded cursor-pointer transition-colors"
                            style={{ background: isCurrent ? "rgba(124,63,196,0.18)" : "rgba(255,255,255,0.03)", border: `1px solid ${isCurrent ? colors.accent : "transparent"}` }}
                          >
                            <div className="relative rounded overflow-hidden flex-shrink-0" style={{ width: 96, height: 54, background: resolveBackground(ep.thumbnailUrl) }}>
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <Play size={14} color="#fff" fill="#fff" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: isCurrent ? colors.accentLight : colors.text }}>{ep.title}</span>
                                {isCurrent && (
                                  <span style={{ fontSize: 9, fontWeight: 700, background: colors.accent, color: "#fff", padding: "1px 5px", borderRadius: 3 }}>WATCHING</span>
                                )}
                              </div>
                              <span style={{ fontSize: 10.5, color: colors.textMuted }}>{ep.durationMinutes}m</span>
                              <p className="line-clamp-1 mt-0.5" style={{ fontSize: 11, color: colors.textMuted, opacity: 0.85 }}>{ep.description}</p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      recommendations.map((movie) => (
                        <div
                          key={movie.id}
                          onClick={() => navigate(`/watch/${movie.id}`)}
                          className="flex gap-3 p-2 rounded cursor-pointer transition-colors hover:bg-white/5"
                          style={{ border: `1px solid ${colors.ring}` }}
                        >
                          <div className="relative rounded overflow-hidden flex-shrink-0" style={{ width: 96, height: 54, background: resolveBackground(movie.thumbnailUrl) }}>
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <Play size={14} color="#fff" fill="#fff" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: colors.text }}>{movie.title}</div>
                            <div style={{ fontSize: 10.5, color: colors.textMuted }}>{movie.genre}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Brand ident. Plays where the video is about to appear, then
                  hands over — the stream is only mounted once this finishes,
                  so nothing plays underneath it. */}
              {pendingPlaybackUrl && !playbackUrl && (
                <SplashWheel
                  fullscreen={false}
                  itemHeight={IDENT_ITEM_HEIGHT}
                  onDone={() => {
                    setPlaybackUrl(pendingPlaybackUrl);
                    setPendingPlaybackUrl(null);
                    setIsPlaying(true);
                  }}
                />
              )}

              {/* Playback failure — replaces the surface rather than firing a
                  browser dialog, and offers the same retry affordance the
                  content rows use. */}
              {playbackError && (
                <div
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-6 text-center"
                  style={{ background: "rgba(12,8,18,0.88)" }}
                >
                  <span style={{ fontSize: 13.5, color: colors.textMuted, maxWidth: 360 }}>
                    {playbackError}
                  </span>
                  <button
                    onClick={retryPlayback}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
                    style={{ background: colors.bgElevated, color: colors.text, border: `1px solid ${colors.ring}`, cursor: "pointer" }}
                  >
                    <RefreshCw size={13} /> Retry
                  </button>
                </div>
              )}

              {/* Bottom Control Bar — shown over the poster and over the video */}
              {!playbackError && !pendingPlaybackUrl && (
                <div className="absolute bottom-0 left-0 right-0 p-3.5 flex items-center justify-between z-10" style={{ background: "linear-gradient(to top, rgba(12,8,18,0.95), transparent)" }}>
                  <div className="flex items-center gap-3 flex-1 mr-4 min-w-0">
                    <button onClick={togglePlay} style={{ background: "none", border: "none", cursor: "pointer" }}>
                      {isPlaying ? <Pause size={16} color={colors.text} /> : <Play size={16} color={colors.text} />}
                    </button>

                    <div
                      ref={scrubberRef}
                      onMouseEnter={() => setIsHoveringBar(true)}
                      onMouseLeave={() => setIsHoveringBar(false)}
                      onMouseMove={handleScrubberMouseMove}
                      onMouseDown={handleScrubberMouseDown}
                      className="relative flex-1 py-2 cursor-pointer min-w-0 outline-none"
                    >
                      {(isHoveringBar || isDragging) && (
                        <div
                          className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded text-[11px] font-mono pointer-events-none z-30"
                          style={{ left: `${hoverXPos}px`, background: colors.bgElevated, color: colors.text, border: `1px solid ${colors.ring}` }}
                        >
                          {formatTime(hoverTimeSec)}
                        </div>
                      )}

                      <div className="w-full rounded-full relative" style={{ height: isHoveringBar || isDragging ? 6 : 4, background: colors.ring }}>
                        <div className="h-full rounded-full relative" style={{ width: `${progressPct}%`, background: colors.accent }}>
                          <div
                            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2"
                            style={{ width: 12, height: 12, borderRadius: "50%", background: colors.accent, opacity: isHoveringBar || isDragging ? 1 : 0 }}
                          />
                        </div>
                      </div>
                    </div>

                    <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: "monospace" }}>
                      {formatTime(currentTimeSec)} / {formatTime(durationSec)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button onClick={toggleMute} style={{ background: "none", border: "none", cursor: "pointer" }}>
                      {isMuted ? <VolumeX size={16} color={colors.textMuted} /> : <Volume2 size={16} color={colors.text} />}
                    </button>
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted }}>1080p</span>
                    <button onClick={toggleFullscreen} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }} aria-label="Fullscreen">
                      <Maximize2 size={16} color={colors.textMuted} />
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Netflix-Style Info Block */}
            <div className="space-y-3.5 w-full min-w-0">
              <h1 style={{ fontFamily: bodyFont, fontSize: 24, fontWeight: 700, color: colors.text }}>
                {currentDisplayTitle}
              </h1>

              <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 13.5, color: colors.textMuted }}>
                <span>{titleData.releaseYear}</span>
                <span>·</span>
                <span>{durationMinutes}m</span>
                <span>·</span>
                <span>{titleData.genre}</span>
                <span>·</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: colors.accentLight, border: `1px solid ${colors.ring}`, padding: "1px 5px", borderRadius: 3 }}>
                  {titleData.rating || "HD"}
                </span>
              </div>

              <p style={{ fontSize: 14, color: colors.textMuted, lineHeight: 1.6, maxWidth: 600 }}>
                {currentDisplayDescription}
              </p>

              <div className="flex items-center gap-3 pt-2 flex-wrap">
                <button
                  onClick={() => setLiked(!liked)}
                  style={{ padding: 9, borderRadius: "50%", background: liked ? "rgba(123,38,133,0.3)" : "rgba(255,255,255,0.06)", border: `1px solid ${colors.ring}`, color: liked ? colors.accentLight : colors.text, cursor: "pointer" }}
                >
                  <ThumbsUp size={16} fill={liked ? colors.accent : "none"} />
                </button>
              </div>

            </div>

          </div>

          {/* Right Sidebar: Recommendations */}
          <div className="lg:col-span-4 w-full min-w-0">
            <div className="p-4 rounded-md space-y-4 w-full" style={{ background: colors.bgElevated, border: `1px solid ${colors.ring}` }}>
              <div className="flex items-center gap-2 pb-2" style={{ borderBottom: `1px solid ${colors.ring}` }}>
                <SmallRing />
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: colors.text }}>More Like This</span>
              </div>

              <div className="space-y-3.5">
                {recommendations.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/watch/${item.id}`)}
                    className="flex gap-3 cursor-pointer group min-w-0"
                  >
                    <div
                      className="relative rounded overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform duration-200"
                      style={{ width: 110, height: 62, background: resolveBackground(item.thumbnailUrl), border: `1px solid ${colors.ring}` }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <Play size={12} color="#fff" fill="#fff" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{item.title}</div>
                      <div className="truncate" style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>{item.genre}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 md:px-10 py-8 w-full mt-12" style={{ borderTop: `1px solid ${colors.ring}` }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <OnionLogo height={56} />
          <div className="flex gap-5">
            {["About", "Creators", "Help", "Terms"].map((l) => (
              <span key={l} style={{ fontSize: 12.5, color: colors.textMuted, cursor: "pointer" }}>{l}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
