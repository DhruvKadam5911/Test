import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, ThumbsUp, ChevronDown } from "lucide-react";
import { colors, bodyFont, resolveBackground } from "../theme";

const WIDTHS = { sm: 156, md: 200, lg: 260 };
const HEIGHTS = { sm: 88, md: 112, lg: 146 };

export function CardSkeleton({ size = "md" }) {
  const w = WIDTHS[size] ?? WIDTHS.md;
  const h = HEIGHTS[size] ?? HEIGHTS.md;

  return (
    <div className="flex-shrink-0 animate-pulse" style={{ width: w }}>
      <div style={{ width: w, height: h, borderRadius: 6, background: colors.bgElevated, border: `1px solid ${colors.ring}` }} />
      <div className="mt-2 space-y-1.5">
        <div style={{ height: 13, width: "75%", background: colors.bgElevated, borderRadius: 3 }} />
        <div style={{ height: 11, width: "45%", background: colors.bgElevated, borderRadius: 3 }} />
      </div>
    </div>
  );
}

export default function ContentCard({ item, size = "md", rank }) {
  const [hover, setHover] = useState(false);
  const [liked, setLiked] = useState(false);
  const navigate = useNavigate();

  const w = WIDTHS[size] ?? WIDTHS.md;
  const h = HEIGHTS[size] ?? HEIGHTS.md;

  // Rank digit sizing — glyph width is estimated from font size. Only a small
  // sliver tucks behind the poster; most of the digit stands out to the left.
  const rankFontSize = h * 0.85;
  const rankGlyphWidth = rankFontSize * 0.62;
  const rankOverlap = rankGlyphWidth * 0.2;

  const titleObj = (item && typeof item.title === "object" ? item.title : item) || {};
  const displayTitle = titleObj.title || "Untitled";
  const displaySub = titleObj.genre ? `${titleObj.genre} • ${titleObj.releaseYear || ""}` : titleObj.contentType || "";
  // TMDB scores out of ten. Shown to one decimal because 7 and 7.4 are
  // different films and rounding to whole numbers hides that.
  const score = typeof titleObj.voteAverage === "number" && titleObj.voteAverage > 0
    ? titleObj.voteAverage.toFixed(1)
    : null;
  const background = resolveBackground(titleObj.thumbnailUrl);

  const handleOpen = () => {
    if (!titleObj.id) return;
    navigate(`/watch/${titleObj.id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: w, marginLeft: rank ? Math.ceil(rankGlyphWidth - rankOverlap) + 12 : 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Static base card — always visible, defines row height, works without hover (touch devices) */}
      <div className="relative" style={{ width: w, height: h }}>
        {/* Rank digit for Top 10 style rows — scoped to image height (bottom:0 here means
            image bottom, not the caption below it) so it never bleeds into the title text.
            Positioned so roughly half its own width tucks behind the poster (zIndex 1 < 2),
            classic Top 10 styling — half hidden under the card, half visible in the gutter. */}
        {rank && (
          <span
            className="absolute bottom-0 pointer-events-none select-none leading-none"
            style={{
              right: `calc(100% - ${rankOverlap}px)`,
              fontFamily: bodyFont,
              fontSize: rankFontSize,
              fontWeight: 800,
              color: colors.bg,
              WebkitTextStroke: `2.5px ${colors.accentLight}`,
              zIndex: 1,
            }}
          >
            {rank}
          </span>
        )}
        <div
          onClick={handleOpen}
          className="absolute inset-0 overflow-hidden cursor-pointer"
          style={{ borderRadius: 6, background, zIndex: 2 }}
        >
          <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: hover ? 0 : 1, transition: "opacity 300ms ease", background: "rgba(12,8,18,0.15)" }}>
            <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(243,240,245,0.92)" }}>
              <Play size={14} color={colors.bg} fill={colors.bg} style={{ marginLeft: 1 }} />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-1.5" style={{ fontFamily: bodyFont }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, lineHeight: 1.3 }} className="truncate">{displayTitle}</div>
        <div style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 1 }} className="truncate">{displaySub}</div>
      </div>

      {/* Hover pop-out surface — overlays the static card + caption, expands with quick actions */}
      <div
        onClick={handleOpen}
        className="absolute left-0 top-0 overflow-hidden cursor-pointer"
        style={{
          width: w,
          borderRadius: 8,
          background: colors.bgElevated,
          border: `1px solid ${colors.ring}`,
          transformOrigin: "center top",
          transform: hover ? "scale(1.28) translateY(-10%)" : "scale(1) translateY(0)",
          opacity: hover ? 1 : 0,
          boxShadow: hover ? "0 22px 44px rgba(0,0,0,0.65)" : "none",
          // Slower and softer than it was. At 260ms on a curve that front-loads
          // most of the movement, the card arrived before the eye had followed
          // it, which reads as a jump rather than an expansion.
          transition:
            "transform 420ms cubic-bezier(.25,.46,.45,.94), opacity 300ms ease, box-shadow 420ms ease",
          zIndex: hover ? 40 : -1,
          pointerEvents: hover ? "auto" : "none",
        }}
      >
        <div className="relative" style={{ width: w, height: h, background }} />
        <div className="p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); handleOpen(); }}
                className="flex items-center justify-center"
                style={{ width: 28, height: 28, borderRadius: "50%", background: colors.text, border: "none", cursor: "pointer" }}
                aria-label="Play"
              >
                <Play size={13} color={colors.bg} fill={colors.bg} style={{ marginLeft: 1 }} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLiked((v) => !v); }}
                className="flex items-center justify-center"
                style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: `1.5px solid ${liked ? colors.accentLight : colors.textMuted}`, cursor: "pointer" }}
                aria-label="Like"
              >
                <ThumbsUp size={12} color={liked ? colors.accentLight : colors.text} fill={liked ? colors.accentLight : "none"} />
              </button>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleOpen(); }}
              className="flex items-center justify-center"
              style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: `1.5px solid ${colors.textMuted}`, cursor: "pointer" }}
              aria-label="More info"
            >
              <ChevronDown size={14} color={colors.text} />
            </button>
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.text }} className="truncate">{displayTitle}</div>

          <div className="flex items-center gap-1.5 flex-wrap" style={{ fontSize: 10.5, color: colors.textMuted }}>
            {score && (
              <span style={{ fontSize: 10, fontWeight: 700, color: colors.accentGreen }}>★ {score}</span>
            )}
            {titleObj.rating && titleObj.rating !== "NR" && (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: colors.text, border: `1px solid ${colors.ring}`, padding: "0 4px", borderRadius: 2 }}>{titleObj.rating}</span>
            )}
            {titleObj.releaseYear && <span>{titleObj.releaseYear}</span>}
            {titleObj.genre && <span>• {titleObj.genre}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
