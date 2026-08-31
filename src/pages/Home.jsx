import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Info } from "lucide-react";
import { colors, bodyFont, displayFont, resolveBackgroundImage } from "../theme";
import RingMotif from "../components/shared/RingMotif";
import OnionLogo from "../components/shared/OnionLogo";
import AppNavbar from "../components/AppNavbar";
import ContentRow from "../components/ContentRow";
import GenreRow from "../components/GenreRow";
import api from "../api/client";

// Characters of the featured description shown before "Read more".
const DESCRIPTION_LIMIT = 150;

// Typing a title should not fire a request per keystroke against the catalog.
const SEARCH_DEBOUNCE_MS = 300;

/*
 * The home page's rows. Four fixed ones, not one per genre — at 148,000 titles
 * and 29 genres the page was 30 rows of things nobody asked for.
 *
 * "Most viewed" is TMDB's vote count: nobody has watched anything in this
 * catalog yet, and how many people bothered to rate a title is the closest
 * honest stand-in.
 */
const ROWS = [
  { key: "viewed", title: "Most Viewed" },
  { key: "rated", title: "Most Rated" },
  { key: "recent", title: "Recently Released" },
];

// How many genre rows follow them. All 29 was the old problem — a page of rows
// nobody asked for — so this is the biggest handful, ordered by how much of the
// catalog each holds, and each row loads only when it is scrolled towards.
const GENRE_ROW_COUNT = 12;

export default function OnionHome() {
  const navigate = useNavigate();

  const [trending, setTrending] = useState([]);
  // One entry per row in ROWS, each filled by its own request.
  const [rows, setRows] = useState({});
  const [genres, setGenres] = useState([]);

  const [loadingTrending, setLoadingTrending] = useState(true);
  const [errorTrending, setErrorTrending] = useState(null);

  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  // The hero's copy. /titles/trending returns the card projection, which
  // deliberately has no description, so the featured title's own detail has to
  // be fetched for it — see docs/schema.md.
  const [featuredDetail, setFeaturedDetail] = useState(null);

  const [descTruncated, setDescTruncated] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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

  const fetchGenres = async () => {
    try {
      const data = await api.get("/titles/genres");
      setGenres(data.slice(0, GENRE_ROW_COUNT));
    } catch (err) {
      console.error("fetchGenres error:", err);
    }
  };

  const fetchRows = async () => {
    // Sorted server-side; ordering 148,000 titles in the browser is not an
    // option, and neither is downloading them.
    await Promise.all(
      ROWS.map(async ({ key }) => {
        try {
          const data = await api.get(`/titles?sort=${key}&limit=20`);
          setRows((current) => ({ ...current, [key]: data }));
        } catch (err) {
          console.error(`fetch ${key} row error:`, err);
          setRows((current) => ({ ...current, [key]: [] }));
        }
      })
    );
  };

  useEffect(() => {
    fetchTrending();
    fetchRows();
    fetchGenres();
  }, []);

  // Search runs against the whole catalog on the server. Filtering a loaded
  // slice in the browser meant most of the library was unfindable — a title
  // outside the first hundred simply did not exist as far as search knew.
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await api.get(`/titles/search?q=${encodeURIComponent(query)}`);
        // A slow response for an abandoned query must not overwrite a newer one.
        if (!cancelled) setSearchResults(data);
      } catch (err) {
        console.error("search error:", err);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const featuredTitle = trending.length > 0 ? trending[0] : null;
  const isSearching = searchQuery.trim().length > 0;

  // Pull the hero's full record once we know which title it is. A failure here
  // costs the description only, so the rest of the hero still renders.
  useEffect(() => {
    if (!featuredTitle?.id) return;
    let cancelled = false;
    api
      .get(`/titles/${featuredTitle.id}`)
      .then((data) => {
        if (!cancelled) setFeaturedDetail(data);
      })
      .catch((err) => console.error("fetchFeaturedDetail error:", err));
    return () => {
      cancelled = true;
    };
  }, [featuredTitle?.id]);

  // Truncate the featured title's own description at a word boundary. The
  // toggle only appears when there is actually something hidden behind it.
  const description = featuredDetail?.description || "";
  const needsTruncating = description.length > DESCRIPTION_LIMIT;
  const shownDescription =
    needsTruncating && descTruncated
      ? `${description.slice(0, description.lastIndexOf(" ", DESCRIPTION_LIMIT))}…`
      : description;

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont }} className="w-full overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {isSearching ? (
        <>
          <AppNavbar value={searchQuery} onSearchChange={setSearchQuery} />
          <div className="pt-8 pb-16 min-h-[70vh]">
            <div className="px-6 md:px-10 mb-4" style={{ color: colors.textMuted, fontSize: 14 }}>
              {searchLoading
                ? `Searching for "${searchQuery}"…`
                : searchResults?.length
                ? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"} for "${searchQuery}"`
                : `No matches for "${searchQuery}"`}
            </div>
            {(searchLoading || searchResults?.length > 0) && (
              <ContentRow
                title="Results"
                items={searchResults || []}
                size="lg"
                loading={searchLoading}
              />
            )}
          </div>
        </>
      ) : (
        <>
          {/* FULL-BLEED CINEMATIC HERO SECTION */}
          <div className="relative w-full min-h-[82vh] md:min-h-[85vh] flex flex-col justify-between overflow-hidden">

            <div
              className="absolute inset-0 z-0 pointer-events-none"
              style={{
                backgroundImage: resolveBackgroundImage(featuredTitle?.heroImageUrl || featuredTitle?.thumbnailUrl),
                backgroundSize: "cover",
                backgroundPosition: "center"
              }}
            >
              <RingMotif size={600} opacity={0.45} style={{ position: "absolute", top: -120, right: -160 }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to right, #0C0812 0%, rgba(12,8,18,0.85) 45%, rgba(12,8,18,0.25) 100%)" }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(12,8,18,0.7) 0%, transparent 25%, transparent 60%, #0C0812 100%)" }} />
            </div>

            <AppNavbar value={searchQuery} onSearchChange={setSearchQuery} />

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
                  <div className="flex items-center gap-2">
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors.accentGreen }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: colors.accentLight, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      {featuredTitle.isOriginal ? "ONION ORIGINAL" : "TRENDING NOW"}
                    </span>
                  </div>

                  <h1 style={{ fontFamily: displayFont, fontSize: "clamp(42px, 6vw, 64px)", fontWeight: 600, color: colors.text, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
                    {featuredTitle.title}
                  </h1>

                  <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 13.5, color: colors.textMuted, fontWeight: 500 }}>
                    <span className="capitalize">{featuredTitle.contentType}</span>
                    <span>·</span>
                    <span>{featuredTitle.genre}</span>
                    <span>·</span>
                    <span>{featuredTitle.releaseYear}</span>
                    {featuredTitle.rating && featuredTitle.rating !== "NR" && (
                      <span>·</span>
                    )}
                    {featuredTitle.rating && featuredTitle.rating !== "NR" && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: colors.text, border: `1px solid ${colors.ring}`, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
                        {featuredTitle.rating}
                      </span>
                    )}
                    {typeof featuredTitle.voteAverage === "number" && featuredTitle.voteAverage > 0 && (
                      <>
                        <span>·</span>
                        <span style={{ color: colors.accentGreen, fontWeight: 700 }}>★ {featuredTitle.voteAverage.toFixed(1)}</span>
                      </>
                    )}
                  </div>

                  <p style={{ fontSize: 15, color: colors.textMuted, lineHeight: 1.6, maxWidth: 520 }}>
                    {shownDescription}
                    {needsTruncating && (
                      <>
                        {" "}
                        <button
                          onClick={() => setDescTruncated(!descTruncated)}
                          style={{ color: colors.text, fontSize: 13, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                        >
                          {descTruncated ? "Read more" : "Show less"}
                        </button>
                      </>
                    )}
                  </p>

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

          </div>

          {/* Content Rows */}
          <div className="mt-8 md:mt-12 pb-4">
            <ContentRow
              title="Trending Now"
              items={trending}
              size="lg"
              rank
              loading={loadingTrending}
              error={errorTrending}
              onRetry={fetchTrending}
            />

            {ROWS.map(({ key, title }) => (
              <ContentRow
                key={key}
                title={title}
                items={rows[key] || []}
                size="md"
                loading={!rows[key]}
              />
            ))}

            {genres.map(({ genre }) => (
              <GenreRow key={genre} genre={genre} />
            ))}
          </div>
        </>
      )}

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
