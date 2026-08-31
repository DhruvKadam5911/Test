import React, { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { colors, bodyFont } from "../theme";
import SmallRing from "./shared/SmallRing";
import ContentCard, { CardSkeleton } from "./ContentCard";

/*
 * The cards expand on hover and the scroller clips them — `overflow-x: auto`
 * forces `overflow-y` to `auto` too, there is no way to have one without the
 * other — so room has to be reserved on every side they grow into.
 *
 * Measured, not guessed: an expanded card reaches 32px above the static one and
 * 96px below it. The padding is those numbers plus a little — the pop-out's
 * meta line can wrap and take a few more — and the row's own
 * bottom margin is nearly nothing, because the padding already separates the
 * rows. Reserving 128px below and another 56px of margin left 184px of empty
 * band between every pair of rows.
 *
 * Devices without hover never expand a card, so they get neither.
 */
const HOVER_CAPABLE =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(hover: hover)").matches
    : true;

export default function ContentRow({ title, items, size = "md", rank = false, loading, error, onRetry }) {
  const scrollerRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => updateArrows();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items, loading, updateArrows]);

  const page = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  if (error) {
    return (
      <div className="mb-14 px-6 md:px-10 py-4 rounded-lg flex items-center justify-between" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${colors.ring}` }}>
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

  if (!loading && (!items || items.length === 0)) return null;

  return (
    <div className={`group/row ${HOVER_CAPABLE ? "mb-1" : "mb-10"}`}>
      <div className="flex items-center gap-2 mb-3 px-6 md:px-10">
        <SmallRing />
        <h2 style={{ fontFamily: bodyFont, fontSize: 16, fontWeight: 700, color: colors.text, letterSpacing: 0.2 }}>{title}</h2>
      </div>

      <div className="relative">
        {/* Left page arrow */}
        {canLeft && (
          <button
            onClick={() => page(-1)}
            className="hidden md:flex items-center justify-center absolute left-0 top-0 bottom-2 z-30 opacity-0 group-hover/row:opacity-100 transition-opacity duration-200"
            style={{ width: 56, background: "linear-gradient(to right, rgba(10,8,14,0.9), transparent)", border: "none", cursor: "pointer" }}
            aria-label="Scroll left"
          >
            <ChevronLeft size={30} color={colors.text} />
          </button>
        )}

        {/* Right page arrow */}
        {canRight && (
          <button
            onClick={() => page(1)}
            className="hidden md:flex items-center justify-center absolute right-0 top-0 bottom-2 z-30 opacity-0 group-hover/row:opacity-100 transition-opacity duration-200"
            style={{ width: 56, background: "linear-gradient(to left, rgba(10,8,14,0.9), transparent)", border: "none", cursor: "pointer" }}
            aria-label="Scroll right"
          >
            <ChevronRight size={30} color={colors.text} />
          </button>
        )}

        <div
          ref={scrollerRef}
          className={`flex gap-3.5 overflow-x-auto ${HOVER_CAPABLE ? "px-8 md:px-12 pt-9 pb-[104px]" : "px-6 md:px-10 pt-2 pb-3"}`}
          style={{ scrollbarWidth: "none" }}
        >
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} size={size} />)
          ) : (
            items.map((item, i) => {
              const titleObj = item && typeof item.title === "object" ? item.title : item;
              return (
                <ContentCard
                  key={titleObj?.id || item.id || i}
                  item={item}
                  size={size}
                  rank={rank ? i + 1 : undefined}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
