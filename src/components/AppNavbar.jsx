import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Search, Bell, X } from "lucide-react";
import { colors } from "../theme";
import OnionLogo from "./shared/OnionLogo";

/**
 * The search box is controlled from outside when `value` is supplied.
 *
 * It has to be. On the home page the navbar sits inside the hero while
 * browsing and outside it while searching, so the first keystroke moves it in
 * the tree and React remounts it — which threw away the text and snapped the
 * box shut mid-word. Owning the text here is what made that visible; owning it
 * in the page makes a remount cost nothing.
 *
 * Pages with no search of their own (WatchPage) pass nothing and keep the
 * self-contained behaviour.
 */
export default function AppNavbar({ value, onSearchChange }) {
  const controlled = value !== undefined;

  const [scrolled, setScrolled] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState("");
  const searchValue = controlled ? value : uncontrolledValue;

  // Open whenever there is something to show, so a remount mid-search does not
  // close the box on a query the page is still displaying results for.
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const searchOpen = manuallyOpen || searchValue.length > 0;

  const searchInputRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Covers both opening the box and being remounted with a query already in
  // flight — in the second case the caret would otherwise be left nowhere.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const closeSearch = () => {
    setManuallyOpen(false);
    if (!controlled) setUncontrolledValue("");
    onSearchChange?.("");
  };

  const handleSearchInput = (e) => {
    const v = e.target.value;
    if (!controlled) setUncontrolledValue(v);
    onSearchChange?.(v);
  };

  return (
    <nav
      className="flex items-center justify-between px-6 md:px-10 py-4 sticky top-0 z-40 w-full transition-colors duration-300"
      style={{
        background: scrolled ? colors.bg : `linear-gradient(to bottom, rgba(12,8,18,0.92), rgba(12,8,18,0))`,
      }}
    >
      <div className="flex items-center gap-10 md:gap-12">
        <Link to="/" style={{ textDecoration: "none" }}>
          <OnionLogo height={84} />
        </Link>
        <div className="hidden md:flex items-center gap-7">
          <Link to="/" style={{ fontSize: 14, fontWeight: 500, color: colors.textMuted, textDecoration: "none" }}>Browse</Link>
          <Link to="/music" style={{ fontSize: 14, fontWeight: 500, color: colors.textMuted, textDecoration: "none" }}>Music</Link>
        </div>
      </div>

      <div className="flex items-center gap-5">
        {/* Live search */}
        <div className="flex items-center">
          {searchOpen ? (
            <div className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${colors.ring}` }}>
              <Search size={15} color={colors.textMuted} />
              <input
                ref={searchInputRef}
                value={searchValue}
                onChange={handleSearchInput}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch();
                  // Backspace in an empty field is a browser "go back" on some
                  // setups, which threw the viewer off the page they were
                  // searching from. Nothing left to delete, nothing to do.
                  if (e.key === "Backspace" && !searchValue) e.preventDefault();
                }}
                placeholder="Titles, genres..."
                className="outline-none bg-transparent"
                style={{ color: colors.text, fontSize: 13, width: 160 }}
              />
              <button onClick={closeSearch} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }} aria-label="Close search">
                <X size={14} color={colors.textMuted} />
              </button>
            </div>
          ) : (
            <button onClick={() => setManuallyOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }} aria-label="Search">
              <Search size={18} color={colors.textMuted} />
            </button>
          )}
        </div>

        <Bell size={18} color={colors.textMuted} style={{ cursor: "pointer" }} className="hidden md:block" />
      </div>
    </nav>
  );
}
