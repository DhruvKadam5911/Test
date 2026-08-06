import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Bell, Play, Info, User, LogOut, RefreshCw } from "lucide-react";
import { colors, bodyFont, displayFont } from "../theme";
import RingMotif from "../components/shared/RingMotif";
import SmallRing from "../components/shared/SmallRing";
import OnionLogo from "../components/shared/OnionLogo";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";

function CardSkeleton({ size = "md" }) {
  const w = size === "lg" ? 260 : 200;
  const h = size === "lg" ? 146 : 112;

  return (
    <div className="flex-shrink-0 animate-pulse" style={{ width: w }}>
      <div 
        style={{ 
          width: w, 
          height: h, 
          borderRadius: 6, 
          background: colors.bgElevated, 
          border: `1px solid ${colors.ring}` 
        }} 
      />
      <div className="mt-2 space-y-1.5">
        <div style={{ height: 13, width: "75%", background: colors.bgElevated, borderRadius: 3 }} />
        <div style={{ height: 11, width: "45%", background: colors.bgElevated, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function Card({ item, size = "md" }) {
  const [hover, setHover] = useState(false);
  const navigate = useNavigate();
  const w = size === "lg" ? 260 : 200;
  const h = size === "lg" ? 146 : 112;

  // Handles both WatchProgress model (item.title is an object) and Title model (item is Title object)
  const titleObj = (item && typeof item.title === "object" ? item.title : item) || {};
  const displayTitle = titleObj.title || "Untitled";
  const displaySub = titleObj.genre ? `${titleObj.genre} • ${titleObj.releaseYear || "2026"}` : titleObj.contentType || "VOD";
  const gradient = titleObj.thumbnailUrl || "linear-gradient(135deg, #3A1F22, #17141A)";

  const handleClick = () => {
    if (titleObj.id) {
      navigate(`/watch/${titleObj.id}`);
    }
  };

  return (
    <div 
      onClick={handleClick}
      onMouseEnter={() => setHover(true)} 
      onMouseLeave={() => setHover(false)}
      className="flex-shrink-0 cursor-pointer"
      style={{ width: w, transform: hover ? "translateY(-6px) scale(1.035)" : "translateY(0) scale(1)", transition: "transform 220ms cubic-bezier(.2,.8,.2,1)" }}
    >
      <div className="relative overflow-hidden" style={{ width: w, height: h, borderRadius: 6, background: gradient, boxShadow: hover ? "0 12px 28px rgba(0,0,0,0.55)" : "0 2px 6px rgba(0,0,0,0.3)", transition: "box-shadow 220ms ease" }}>
        <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: hover ? 1 : 0, transition: "opacity 180ms ease", background: "rgba(12,8,18,0.35)" }}>
          <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(243,240,245,0.92)" }}>
            <Play size={14} color={colors.bg} fill={colors.bg} style={{ marginLeft: 1 }} />
          </div>
        </div>
      </div>
      <div className="mt-1.5" style={{ fontFamily: bodyFont }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, lineHeight: 1.3 }} className="truncate">{displayTitle}</div>
        <div style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 1 }} className="truncate">{displaySub}</div>
      </div>
    </div>
  );
}

function Row({ title, items, size, loading, error, onRetry }) {
  if (error) {
    return (
      <div className="mb-9 px-6 md:px-10 py-4 rounded-lg flex items-center justify-between" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${colors.ring}` }}>
        <div className="flex items-center gap-2" style={{ color: colors.textMuted, fontSize: 13 }}>
          <span>Couldn't load {title.toLowerCase()} — try again</span>
        </div>
        {onRetry && (
          <button 
            onClick={onRetry} 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold" 
            style={{ background: colors.bgElevated, color: colors.text, border: `1px solid ${colors.ring}`, cursor: "pointer" }}
          >
            <RefreshCw size={13} /> Retry
          </button>
        )}
      </div>
    );
  }

  if (!loading && (!items || items.length === 0)) {
    return null; // Hide row if empty
  }

  return (
    <div className="mb-9">
      <div className="flex items-center gap-2 mb-3 px-6 md:px-10">
        <SmallRing />
        <h2 style={{ fontFamily: bodyFont, fontSize: 16, fontWeight: 700, color: colors.text, letterSpacing: 0.2 }}>{title}</h2>
      </div>
      <div className="flex gap-3.5 overflow-x-auto px-6 md:px-10 pb-2" style={{ scrollbarWidth: "none" }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} size={size} />)
        ) : (
          items.map((item, i) => <Card key={item.id || i} item={item} size={size} />)
        )}
      </div>
    </div>
  );
}

export default function OnionHome() {
  const navigate = useNavigate();
  const { user, token, isLoggedIn, logout } = useAuth();
  
  const [trending, setTrending] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingCW, setLoadingCW] = useState(false);
  const [errorTrending, setErrorTrending] = useState(null);

  const [descTruncated, setDescTruncated] = useState(true);

  const fetchTrending = async () => {
    setLoadingTrending(true);
    setErrorTrending(null);
    try {
      const data = await api.get("/titles/trending");
      setTrending(data);
    } catch (err) {
      console.error("fetchTrending error:", err);
      setErrorTrending(err.message);
    } finally {
      setLoadingTrending(false);
    }
  };

  const fetchContinueWatching = async () => {
    if (!token) return;
    setLoadingCW(true);
    try {
      const data = await api.get("/progress/continue-watching", token);
      setContinueWatching(data);
    } catch (err) {
      console.warn("fetchContinueWatching warning:", err.message);
    } finally {
      setLoadingCW(false);
    }
  };

  useEffect(() => {
    fetchTrending();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchContinueWatching();
    } else {
      setContinueWatching([]);
    }
  }, [isLoggedIn, token]);

  const featuredTitle = trending.length > 0 ? trending[0] : null;

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont }} className="w-full overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* FULL-BLEED CINEMATIC HERO SECTION */}
      <div className="relative w-full min-h-[82vh] md:min-h-[85vh] flex flex-col justify-between overflow-hidden">
        
        {/* Background Gradient & Ambient Motif Slot */}
        <div 
          className="absolute inset-0 z-0 pointer-events-none"
          style={{ 
            backgroundImage: featuredTitle?.heroImageUrl || featuredTitle?.thumbnailUrl || "linear-gradient(135deg, #3A1F22, #17141A)", 
            backgroundSize: "cover", 
            backgroundPosition: "center" 
          }}
        >
          {/* Concentric Decorative Ring Motif Overlay */}
          <RingMotif size={600} opacity={0.45} style={{ position: "absolute", top: -120, right: -160 }} />

          {/* Left-to-right fade gradient for text contrast */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to right, #0C0812 0%, rgba(12,8,18,0.85) 45%, rgba(12,8,18,0.25) 100%)" }} />
          
          {/* Top-to-bottom fade gradient for nav and seamless row blending */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(12,8,18,0.7) 0%, transparent 25%, transparent 60%, #0C0812 100%)" }} />
        </div>

        {/* Sticky Header Navigation */}
        <nav className="flex items-center justify-between px-6 md:px-10 py-5 sticky top-0 z-30 w-full"
          style={{ background: `linear-gradient(to bottom, rgba(12,8,18,0.92), rgba(12,8,18,0))` }}>
          <div className="flex items-center gap-10 md:gap-12">
            <Link to="/" style={{ textDecoration: "none" }}>
              <OnionLogo height={58} />
            </Link>
            <div className="hidden md:flex items-center gap-7">
              {["Browse", "Originals"].map((l) => (
                <span key={l} style={{ fontSize: 14, fontWeight: 500, color: colors.textMuted, cursor: "pointer" }}>{l}</span>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-5">
            <Search size={18} color={colors.textMuted} style={{ cursor: "pointer" }} />
            <Bell size={18} color={colors.textMuted} style={{ cursor: "pointer" }} className="hidden md:block" />
            
            {isLoggedIn ? (
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }} className="hidden sm:inline">
                  {user?.username}
                </span>
                <button 
                  onClick={logout}
                  title="Sign out"
                  style={{ width: 32, height: 32, borderRadius: "50%", background: colors.bgCard, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${colors.ring}`, cursor: "pointer" }}
                >
                  <LogOut size={15} color={colors.textMuted} />
                </button>
              </div>
            ) : (
              <Link to="/auth" style={{ textDecoration: "none" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: colors.bgCard, display: "flex", flexShrink: 0, alignItems: "center", justifyContent: "center", border: `1px solid ${colors.ring}` }}>
                  <User size={15} color={colors.textMuted} />
                </div>
              </Link>
            )}
          </div>
        </nav>

        {/* Hero Left Content Container */}
        <div className="relative z-10 px-6 md:px-10 pb-12 pt-16 md:pt-28 max-w-7xl mx-auto w-full flex-1 flex flex-col justify-end">
          
          {loadingTrending ? (
            <div className="max-w-[500px] space-y-4 animate-pulse">
              <div style={{ height: 14, width: 140, background: colors.bgElevated, borderRadius: 4 }} />
              <div style={{ height: 52, width: "85%", background: colors.bgElevated, borderRadius: 6 }} />
              <div style={{ height: 16, width: 220, background: colors.bgElevated, borderRadius: 4 }} />
              <div style={{ height: 44, width: "100%", background: colors.bgElevated, borderRadius: 6 }} />
            </div>
          ) : featuredTitle ? (
            <div className="max-w-[620px] space-y-4">
              
              {/* Studio Tag */}
              <div className="flex items-center gap-2">
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors.accentGreen }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: colors.accentLight, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  {featuredTitle.isOriginal ? "ONION ORIGINAL" : "FEATURED VOD"}
                </span>
              </div>

              {/* Title */}
              <h1 style={{ fontFamily: displayFont, fontSize: "clamp(42px, 6vw, 64px)", fontWeight: 600, color: colors.text, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
                {featuredTitle.title}
              </h1>

              {/* Meta Dot Row */}
              <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 13.5, color: colors.textMuted, fontWeight: 500 }}>
                <span className="capitalize">{featuredTitle.contentType}</span>
                <span>·</span>
                <span>{featuredTitle.genre}</span>
                <span>·</span>
                <span>{featuredTitle.releaseYear}</span>
                <span>·</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.text, border: `1px solid ${colors.ring}`, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
                  {featuredTitle.rating || "PG-13"}
                </span>
              </div>

              {/* Description */}
              <p style={{ fontSize: 15, color: colors.textMuted, lineHeight: 1.6, maxWidth: 520 }}>
                {descTruncated ? "A dockworker uncovers a smuggling route beneath the city she swore to leave. Eight episodes..." : (featuredTitle.description || "Stream new episodes now on Onion.")}
                {" "}
                <button 
                  onClick={() => setDescTruncated(!descTruncated)}
                  style={{ color: colors.text, fontSize: 13, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  {descTruncated ? "Read more" : "Show less"}
                </button>
              </p>

              {/* Button Row */}
              <div className="flex items-center gap-3 pt-3 flex-wrap">
                <button 
                  onClick={() => navigate(`/watch/${featuredTitle.id}`)}
                  className="flex items-center gap-2.5 transition-transform duration-180 hover:scale-105"
                  style={{ fontFamily: bodyFont, fontSize: 14, fontWeight: 700, color: colors.bg, background: colors.text, border: "none", borderRadius: 4, padding: "11px 22px", cursor: "pointer" }}
                >
                  <Play size={16} fill={colors.bg} /> Watch now
                </button>

                <button 
                  onClick={() => navigate(`/watch/${featuredTitle.id}`)}
                  className="flex items-center gap-2.5 transition-transform duration-180 hover:scale-105"
                  style={{ fontFamily: bodyFont, fontSize: 14, fontWeight: 600, color: colors.text, background: "rgba(255,255,255,0.08)", border: `1px solid ${colors.ring}`, borderRadius: 4, padding: "11px 22px", cursor: "pointer" }}
                >
                  <Info size={16} color={colors.text} /> More Info
                </button>
              </div>

            </div>
          ) : null}

        </div>

        {/* Bottom-Right Badge Cluster */}
        <div className="absolute bottom-6 right-6 md:right-10 z-10 flex items-center gap-2 hidden sm:flex">
          <div style={{ background: colors.accent, color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 4, letterSpacing: 0.5 }}>
            #1 IN SERIES TODAY
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${colors.ring}`, color: colors.textMuted, fontSize: 11, fontWeight: 600, padding: "4px 8px", borderRadius: 4 }}>
            TV-MA
          </div>
        </div>

      </div>

      {/* Content Rows */}
      <div className="mt-8 md:mt-12 pb-16">
        {/* Continue Watching (Only shown if logged in and items exist) */}
        {isLoggedIn && continueWatching.length > 0 && (
          <Row 
            title="Continue watching" 
            items={continueWatching} 
            loading={loadingCW} 
          />
        )}

        {/* Trending on Onion */}
        <Row 
          title="Trending on Onion" 
          items={trending} 
          size="lg" 
          loading={loadingTrending}
          error={errorTrending}
          onRetry={fetchTrending}
        />
      </div>

      {/* Footer */}
      <footer className="px-6 md:px-10 py-8 w-full" style={{ borderTop: `1px solid ${colors.ring}` }}>
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
