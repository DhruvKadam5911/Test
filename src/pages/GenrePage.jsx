import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { colors, bodyFont, displayFont } from "../theme";
import AppNavbar from "../components/AppNavbar";
import ContentCard from "../components/ContentCard";
import api from "../api/client";

/*
 * Everything in one genre, as a grid rather than a row.
 *
 * A row shows twenty titles and hides the rest behind a horizontal scroll; the
 * genres here hold thousands. Paged rather than infinite, so the viewer decides
 * how much of a 20,000-title genre they want to pull down.
 */

const PAGE_SIZE = 40;

export default function GenrePage() {
  const { genre } = useParams();
  const name = decodeURIComponent(genre || "");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exhausted, setExhausted] = useState(false);

  const load = async (offset) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(
        `/titles?genre=${encodeURIComponent(name)}&sort=viewed&limit=${PAGE_SIZE}&offset=${offset}`
      );
      setItems((current) => (offset === 0 ? data : [...current, ...data]));
      // A short page is the last page — there is no total to compare against.
      if (data.length < PAGE_SIZE) setExhausted(true);
    } catch (err) {
      console.error("fetchGenrePage error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setItems([]);
    setExhausted(false);
    load(0);
    window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont }} className="w-full overflow-x-hidden">
      <AppNavbar />

      <div className="px-6 md:px-10 pt-6 pb-20">
        <h1 style={{ fontFamily: displayFont, fontSize: "clamp(28px, 4.5vw, 40px)", fontWeight: 600, color: colors.text, letterSpacing: "-0.02em" }}>
          {name}
        </h1>

        <div className="mt-7 flex flex-wrap gap-3.5">
          {items.map((item) => (
            <ContentCard key={item.id} item={item} size="md" />
          ))}
        </div>

        {error && (
          <div className="mt-8" style={{ color: colors.textMuted, fontSize: 14 }}>
            {error}{" "}
            <button
              onClick={() => load(items.length)}
              style={{ background: "none", border: "none", color: colors.accentLight, cursor: "pointer", fontSize: 14 }}
            >
              Try again
            </button>
          </div>
        )}

        {!error && !exhausted && (
          <div className="mt-10 flex justify-center">
            <button
              onClick={() => load(items.length)}
              disabled={loading}
              style={{
                fontFamily: bodyFont, fontSize: 14, fontWeight: 600, color: colors.text,
                background: "rgba(255,255,255,0.08)", border: `1px solid ${colors.ring}`,
                borderRadius: 4, padding: "11px 26px", cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="mt-10" style={{ color: colors.textMuted, fontSize: 14 }}>
            Nothing in this genre yet.
          </div>
        )}
      </div>
    </div>
  );
}
