import React, { useState, useEffect, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Search, Bell, Play, Pause, Volume2, VolumeX, Maximize2, User, Plus, Check, ThumbsUp, ThumbsDown, ListVideo, X, LogIn, RefreshCw } from "lucide-react";
import { colors, bodyFont, displayFont } from "../theme";
import SmallRing from "../components/shared/SmallRing";
import OnionLogo from "../components/shared/OnionLogo";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";

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

function Card({ item, size = "md" }) {
  const [hover, setHover] = useState(false);
  const navigate = useNavigate();
  const w = size === "lg" ? 260 : 200;
  const h = size === "lg" ? 146 : 112;

  const handleClick = () => {
    navigate(`/watch/${item.id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div 
      onClick={handleClick}
      onMouseEnter={() => setHover(true)} 
      onMouseLeave={() => setHover(false)}
      className="flex-shrink-0 cursor-pointer"
      style={{ width: w, transform: hover ? "translateY(-6px) scale(1.035)" : "translateY(0) scale(1)", transition: "transform 220ms cubic-bezier(.2,.8,.2,1)" }}
    >
      <div className="relative overflow-hidden" style={{ width: w, height: h, borderRadius: 6, background: item.thumbnailUrl || "linear-gradient(135deg, #3A1F22, #17141A)", boxShadow: hover ? "0 12px 28px rgba(0,0,0,0.55)" : "0 2px 6px rgba(0,0,0,0.3)", transition: "box-shadow 220ms ease" }}>
        <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: hover ? 1 : 0, transition: "opacity 180ms ease", background: "rgba(12,8,18,0.35)" }}>
          <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(243,240,245,0.92)" }}>
            <Play size={14} color={colors.bg} fill={colors.bg} style={{ marginLeft: 1 }} />
          </div>
        </div>
      </div>
      <div className="mt-1.5" style={{ fontFamily: bodyFont }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, lineHeight: 1.3 }} className="truncate">{item.title}</div>
        <div style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 1 }} className="truncate">{item.genre} • {item.releaseYear || "2026"}</div>
      </div>
    </div>
  );
}

function Row({ title, items, size }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-9">
      <div className="flex items-center gap-2 mb-3 px-6 md:px-10">
        <SmallRing />
        <h2 style={{ fontFamily: bodyFont, fontSize: 16, fontWeight: 700, color: colors.text, letterSpacing: 0.2 }}>{title}</h2>
      </div>
      <div className="flex gap-3.5 overflow-x-auto px-6 md:px-10 pb-2" style={{ scrollbarWidth: "none" }}>
        {items.map((item, i) => <Card key={item.id || i} item={item} size={size} />)}
      </div>
    </div>
  );
}

export default function WatchPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const { user, token, isLoggedIn } = useAuth();

  const [titleData, setTitleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [recommendations, setRecommendations] = useState([]);
  const [inList, setInList] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);

  const [isPlaying, setIsPlaying] = useState(true);
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

  // 1. Fetch Title Details from API
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

  // 2. Check if title is in user's My List
  const checkMyList = async () => {
    if (!token) return;
    try {
      const myListItems = await api.get("/mylist", token);
      const exists = myListItems.some((item) => item.titleId === videoId);
      setInList(exists);
    } catch (e) {
      console.warn("checkMyList warning:", e);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    fetchTitleDetails();
    checkMyList();
  }, [videoId, token]);

  const isSeries = titleData?.contentType === "series";
  const activeSeason = isSeries && titleData?.seasons ? titleData.seasons[selectedSeasonIdx] : null;
  const activeEpisode = activeSeason ? activeSeason.episodes[activeEpisodeIdx] : null;

  const durationMinutes = isSeries && activeEpisode ? activeEpisode.durationMinutes : titleData?.durationMinutes || 48;
  const durationSec = parseDurationToSeconds(durationMinutes);

  const currentDisplayTitle = isSeries && activeEpisode ? activeEpisode.title : titleData?.title;
  const currentDisplayDescription = isSeries && activeEpisode ? activeEpisode.description : titleData?.description;

  // 3. Fetch Playback URL (Protected Endpoint)
  const fetchPlaybackUrl = async () => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }

    try {
      let endpoint = `/titles/${videoId}/playback`;
      if (isSeries && activeEpisode) {
        endpoint += `?episodeId=${activeEpisode.id}`;
      }
      const data = await api.get(endpoint, token);
      setPlaybackUrl(data.playbackUrl);
      setIsPlaying(true);
    } catch (err) {
      if (err.status === 401) {
        setShowAuthModal(true);
      } else {
        alert(err.message || "Failed to fetch video stream.");
      }
    }
  };

  // Reset playback position on episode change
  useEffect(() => {
    setCurrentTimeSec(0);
    setPlaybackUrl(null);
  }, [activeEpisodeIdx, selectedSeasonIdx, videoId]);

  // Periodic Watch Progress Sync (Every 15s while playing)
  useEffect(() => {
    if (!token || !isLoggedIn || !titleData) return;

    const syncProgress = async () => {
      if (currentTimeSec > 5) {
        try {
          await api.post(
            "/progress",
            {
              titleId: titleData.id,
              episodeId: isSeries && activeEpisode ? activeEpisode.id : null,
              progressSeconds: currentTimeSec,
              completed: currentTimeSec >= durationSec - 10,
            },
            token
          );
        } catch (e) {
          console.warn("syncProgress warning:", e);
        }
      }
    };

    const interval = setInterval(syncProgress, 15000);
    return () => {
      clearInterval(interval);
      syncProgress(); // Sync on unmount
    };
  }, [currentTimeSec, isPlaying, token, isLoggedIn, titleData, activeEpisode]);

  // Simulated Playback Timer
  useEffect(() => {
    let interval = null;
    if (isPlaying && !isDragging) {
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
  }, [isPlaying, isDragging, durationSec]);

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
    setCurrentTimeSec(sec);
    setHoverTimeSec(sec);
    setHoverXPos(offsetX);
  };

  const handleScrubberMouseMove = (e) => {
    if (!scrubberRef.current) return;
    const { sec, offsetX } = calculateSecFromX(e.clientX);
    setHoverTimeSec(sec);
    setHoverXPos(offsetX);
    if (isDragging) {
      setCurrentTimeSec(sec);
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (isDragging) {
        const { sec, offsetX } = calculateSecFromX(e.clientX);
        setCurrentTimeSec(sec);
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

  // Toggle My List
  const handleToggleMyList = async () => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }

    try {
      if (inList) {
        await api.delete(`/mylist/${videoId}`, token);
        setInList(false);
      } else {
        await api.post("/mylist", { titleId: videoId }, token);
        setInList(true);
      }
    } catch (err) {
      alert(err.message || "Failed to update My List.");
    }
  };

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

      {/* Sticky Header Navigation */}
      <nav className="flex items-center justify-between px-6 md:px-10 py-5 sticky top-0 z-20 w-full"
        style={{ background: `linear-gradient(to bottom, rgba(12,8,18,0.95), rgba(12,8,18,0))` }}>
        <div className="flex items-center gap-10 md:gap-12">
          <Link to="/" style={{ textDecoration: "none" }}>
            <OnionLogo height={58} />
          </Link>
          <div className="hidden md:flex items-center gap-7">
            <Link to="/" style={{ fontSize: 14, fontWeight: 500, color: colors.textMuted, textDecoration: "none" }}>Browse</Link>
            <Link to="/" style={{ fontSize: 14, fontWeight: 500, color: colors.textMuted, textDecoration: "none" }}>Originals</Link>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Search size={18} color={colors.textMuted} style={{ cursor: "pointer" }} />
          <Bell size={18} color={colors.textMuted} style={{ cursor: "pointer" }} className="hidden md:block" />
          {isLoggedIn ? (
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: colors.bgCard, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${colors.ring}` }}>
              <User size={15} color={colors.textMuted} />
            </div>
          ) : (
            <Link to="/auth" style={{ textDecoration: "none" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: colors.bgCard, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${colors.ring}` }}>
                <User size={15} color={colors.textMuted} />
              </div>
            </Link>
          )}
        </div>
      </nav>

      {/* Main Watch Layout */}
      <div className="px-6 md:px-10 py-6 max-w-7xl mx-auto w-full min-w-0 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full min-w-0 items-start">
          
          {/* Left Column: Video Player & Info */}
          <div className="lg:col-span-8 w-full min-w-0 space-y-6">
            
            {/* 16:9 Video Player */}
            <div className="relative aspect-video rounded-lg overflow-hidden flex items-center justify-center w-full select-none" style={{ background: titleData.thumbnailUrl || "linear-gradient(135deg, #3A1F22, #17141A)", border: `1px solid ${colors.ring}` }}>
              
              {/* If playbackUrl is fetched, render real HTML5 video tag or player surface */}
              {playbackUrl ? (
                <video 
                  src={playbackUrl} 
                  controls 
                  autoPlay 
                  className="w-full h-full object-cover"
                />
              ) : (
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
                    {isPlaying ? (
                      <Pause size={26} color="#fff" fill="#fff" />
                    ) : (
                      <Play size={26} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
                    )}
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
                            <div className="relative rounded overflow-hidden flex-shrink-0" style={{ width: 96, height: 54, background: ep.thumbnailUrl || "linear-gradient(135deg, #3A1F22, #17141A)" }}>
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
                          <div className="relative rounded overflow-hidden flex-shrink-0" style={{ width: 96, height: 54, background: movie.thumbnailUrl }}>
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

              {/* Bottom Control Bar */}
              {!playbackUrl && (
                <div className="absolute bottom-0 left-0 right-0 p-3.5 flex items-center justify-between z-10" style={{ background: "linear-gradient(to top, rgba(12,8,18,0.95), transparent)" }}>
                  <div className="flex items-center gap-3 flex-1 mr-4 min-w-0">
                    <button onClick={() => setIsPlaying(!isPlaying)} style={{ background: "none", border: "none", cursor: "pointer" }}>
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
                    <button onClick={() => setIsMuted(!isMuted)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                      {isMuted ? <VolumeX size={16} color={colors.textMuted} /> : <Volume2 size={16} color={colors.text} />}
                    </button>
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted }}>1080p</span>
                    <Maximize2 size={16} color={colors.textMuted} />
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
                  onClick={handleToggleMyList}
                  className="flex items-center gap-2"
                  style={{ fontFamily: bodyFont, fontSize: 13, fontWeight: 600, color: colors.text, background: "rgba(255,255,255,0.06)", border: `1px solid ${colors.ring}`, borderRadius: 4, padding: "8px 14px", cursor: "pointer" }}
                >
                  {inList ? <Check size={15} color={colors.accentLight} /> : <Plus size={15} />}
                  <span>{inList ? "In My List" : "My List"}</span>
                </button>

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
                      style={{ width: 110, height: 62, background: item.thumbnailUrl || "linear-gradient(135deg, #3A1F22, #17141A)", border: `1px solid ${colors.ring}` }}
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

      {/* Auth Prompt Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="p-6 rounded-xl max-w-sm w-full space-y-4 text-center" style={{ background: colors.bgElevated, border: `1px solid ${colors.ring}` }}>
            <h3 style={{ fontFamily: displayFont, fontSize: 20 }}>Sign In to Watch</h3>
            <p style={{ fontSize: 13, color: colors.textMuted }}>Please sign in to stream movies and series on Onion.</p>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setShowAuthModal(false)}
                className="flex-1 py-2 rounded text-xs font-semibold"
                style={{ background: "rgba(255,255,255,0.08)", color: colors.text, border: `1px solid ${colors.ring}` }}
              >
                Cancel
              </button>
              <button 
                onClick={() => navigate("/auth")}
                className="flex-1 py-2 rounded text-xs font-bold"
                style={{ background: colors.accent, color: "#fff" }}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="px-6 md:px-10 py-8 w-full mt-12" style={{ borderTop: `1px solid ${colors.ring}` }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <OnionLogo height={40} />
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
