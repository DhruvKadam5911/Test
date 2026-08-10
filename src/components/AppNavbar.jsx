import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Search, Bell, X } from "lucide-react";
import { colors } from "../theme";
import OnionLogo from "./shared/OnionLogo";

export default function AppNavbar({ onSearchChange }) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const searchInputRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchValue("");
    onSearchChange?.("");
  };

  const handleSearchInput = (e) => {
    const v = e.target.value;
    setSearchValue(v);
    onSearchChange?.(v);
  };

  return (
    <nav
      className="flex items-center justify-between px-6 md:px-10 py-4 sticky top-0 z-40 w-full transition-colors duration-300"
      style={{
        background: scrolled ? colors.bg : `linear-gradient(to bottom, rgba(12,8,18,0.92), rgba(12,8,18,0))`,
        borderBottom: scrolled ? `1px solid ${colors.ring}` : "1px solid transparent",
      }}
    >
      <div className="flex items-center gap-10 md:gap-12">
        <Link to="/" style={{ textDecoration: "none" }}>
          <OnionLogo height={84} />
        </Link>
        <div className="hidden md:flex items-center gap-7">
          <Link to="/" style={{ fontSize: 14, fontWeight: 500, color: colors.textMuted, textDecoration: "none" }}>Browse</Link>
          <Link to="/" style={{ fontSize: 14, fontWeight: 500, color: colors.textMuted, textDecoration: "none" }}>Originals</Link>
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
                onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                placeholder="Titles, genres..."
                className="outline-none bg-transparent"
                style={{ color: colors.text, fontSize: 13, width: 160 }}
              />
              <button onClick={closeSearch} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }} aria-label="Close search">
                <X size={14} color={colors.textMuted} />
              </button>
            </div>
          ) : (
            <button onClick={openSearch} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }} aria-label="Search">
              <Search size={18} color={colors.textMuted} />
            </button>
          )}
        </div>

        <Bell size={18} color={colors.textMuted} style={{ cursor: "pointer" }} className="hidden md:block" />
      </div>
    </nav>
  );
}
