import React from "react";
import { Link } from "react-router-dom";
import { Search, Bell, User } from "lucide-react";
import { colors, displayFont } from "../../theme";

export default function Navbar() {
  return (
    <nav 
      className="flex items-center justify-between px-6 md:px-10 py-4 sticky top-0 z-20"
      style={{ background: `linear-gradient(to bottom, rgba(13,10,18,0.95), rgba(13,10,18,0))` }}
    >
      <div className="flex items-center gap-8">
        <Link to="/" style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 600, color: colors.text, textDecoration: "none", letterSpacing: 0.3 }}>
          onion
        </Link>
        <div className="hidden md:flex items-center gap-6">
          <Link to="/" style={{ fontSize: 13.5, fontWeight: 500, color: colors.textMuted, textDecoration: "none" }}>
            Browse
          </Link>
          <Link to="/" style={{ fontSize: 13.5, fontWeight: 500, color: colors.textMuted, textDecoration: "none" }}>
            Originals
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Search size={17} color={colors.textMuted} style={{ cursor: "pointer" }} />
        <Bell size={17} color={colors.textMuted} style={{ cursor: "pointer" }} className="hidden md:block" />
        <Link to="/auth" style={{ textDecoration: "none" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: colors.bgCard, display: "flex", flexShrink: 0, alignItems: "center", justifyContent: "center", border: `1px solid ${colors.ring}` }}>
            <User size={14} color={colors.textMuted} />
          </div>
        </Link>
      </div>
    </nav>
  );
}
