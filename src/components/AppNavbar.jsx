import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Search, Bell, X, Music2, ChevronDown, LayoutGrid, Users } from "lucide-react";
import { colors } from "../theme";
import OnionLogo from "./shared/OnionLogo";
import api from "../api/client";

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

  // The genre menu. Fetched once when it is first opened rather than on every
  // page load — most visits never touch it.
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [genres, setGenres] = useState(null);

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

  useEffect(() => {
    if (!categoriesOpen || genres) return;
    api
      .get("/titles/genres")
      .then(setGenres)
      .catch((err) => {
        console.error("fetchGenres error:", err);
        setGenres([]);
      });
  }, [categoriesOpen, genres]);

  // A menu that only closes on a second click on the trigger is a menu people
  // leave open by accident.
  //
  // Matched by attribute rather than by ref: the trigger and the menu are
  // separate elements on a phone, and there are two of each — one set for the
  // wide layout, one for the narrow — so no single ref covers them.
  useEffect(() => {
    if (!categoriesOpen) return;
    const onDown = (e) => {
      if (!e.target.closest?.("[data-categories]")) setCategoriesOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [categoriesOpen]);

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

  const categoryList =
    genres === null ? (
      <div style={{ padding: "8px 10px", fontSize: 13, color: colors.textMuted }}>Loading…</div>
    ) : (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-2">
        {genres.map(({ genre, count }) => (
          <Link
            key={genre}
            to={`/genre/${encodeURIComponent(genre)}`}
            onClick={() => setCategoriesOpen(false)}
            className="flex items-center justify-between rounded"
            style={{ fontSize: 13, color: colors.text, textDecoration: "none", padding: "7px 10px" }}
          >
            <span className="truncate">{genre}</span>
            <span style={{ fontSize: 11, color: colors.textMuted, marginLeft: 8 }}>{count.toLocaleString()}</span>
          </Link>
        ))}
      </div>
    );

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

          <div data-categories style={{ position: "relative" }}>
            <button
              onClick={() => setCategoriesOpen((open) => !open)}
              className="flex items-center gap-1"
              style={{ fontSize: 14, fontWeight: 500, color: colors.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              Categories
              <ChevronDown size={14} color={colors.textMuted} style={{ transform: categoriesOpen ? "rotate(180deg)" : "none", transition: "transform 200ms ease" }} />
            </button>

            {categoriesOpen && (
              <div
                className="absolute left-0 mt-3 rounded"
                style={{ background: colors.bgElevated, border: `1px solid ${colors.ring}`, padding: 8, minWidth: 520, boxShadow: "0 18px 40px rgba(0,0,0,0.6)", zIndex: 50 }}
              >
                {categoryList}
              </div>
            )}
          </div>

          <Link to="/music" className="flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 500, color: colors.textMuted, textDecoration: "none" }}>
            <Music2 size={15} color={colors.textMuted} />
            Music
          </Link>

          <button
            onClick={() => alert("Watch Together coming soon!")}
            className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer hover:text-white transition-colors"
            style={{ fontSize: 14, fontWeight: 500, color: colors.textMuted, fontFamily: "inherit", padding: 0 }}
            title="Watch Together (Coming Soon)"
          >
            <Users size={15} color={colors.accentLight} />
            Watch Together
          </button>
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

        <button
          onClick={() => alert("Watch Together coming soon!")}
          className="md:hidden flex bg-transparent border-none cursor-pointer p-0"
          aria-label="Watch Together"
          title="Watch Together (Coming Soon)"
        >
          <Users size={18} color={colors.accentLight} />
        </button>

        <Link to="/music" className="md:hidden flex" aria-label="Music">
          <Music2 size={18} color={colors.textMuted} />
        </Link>
        <button
          onClick={() => setCategoriesOpen((open) => !open)}
          data-categories
          className="md:hidden flex"
          aria-label="Categories"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <LayoutGrid size={18} color={colors.textMuted} />
        </button>

        <Bell size={18} color={colors.textMuted} style={{ cursor: "pointer" }} className="hidden md:block" />
      </div>

      {categoriesOpen && (
        <div
          data-categories
          className="md:hidden absolute left-3 right-3 rounded"
          style={{ top: "100%", background: colors.bgElevated, border: `1px solid ${colors.ring}`, padding: 8, boxShadow: "0 18px 40px rgba(0,0,0,0.6)", zIndex: 50, maxHeight: "70vh", overflowY: "auto" }}
        >
          {categoryList}
        </div>
      )}
    </nav>
  );
}
