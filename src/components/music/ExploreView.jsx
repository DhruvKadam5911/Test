import React from "react";
import { colors, bodyFont, displayFont } from "../../theme";

/*
 * Explore — the way into the catalogue for someone who does not have a song in
 * mind. Four ways in at the top, then what is new, then what is charting, then
 * the moods.
 *
 * It takes its rows as props rather than fetching: the page above owns the
 * data and the quota, and a view that quietly makes its own requests is how a
 * hundred-searches-a-day allowance disappears.
 */

// A stripe of colour per mood, the way the shelves in a record shop are
// coloured — nothing semantic, just something to tell them apart at a glance.
const STRIPES = [
  "#7B2685", "#2E7D6B", "#B4523F", "#3E5FAE", "#8A6B2C",
  "#5B3E8A", "#2F7A46", "#A03A5E", "#2B6E8F", "#8A4A2C",
];

export default function ExploreView({
  shortcuts,
  onShortcut,
  albums,
  top,
  moods,
  onMood,
  cardRow,
  trackRow,
}) {
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {shortcuts.map(([label, Icon, term]) => (
          <button
            key={label}
            onClick={() => onShortcut(term)}
            className="flex items-center gap-3 rounded-lg"
            style={{
              background: "rgba(255,255,255,0.06)", border: `1px solid ${colors.ring}`,
              padding: "18px 16px", cursor: "pointer", textAlign: "left",
              fontFamily: bodyFont, fontSize: 15, fontWeight: 600, color: colors.text,
            }}
          >
            <Icon size={20} color={colors.accentLight} />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-9">
        {cardRow("New albums and singles", albums || [])}
      </div>

      {top?.length > 0 && (
        <>
          <div style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 600, marginBottom: 10 }}>
            Top songs
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
            {top.map(trackRow)}
          </div>
        </>
      )}

      <div style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 600, margin: "34px 0 12px" }}>
        Moods and genres
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {moods.map((mood, i) => (
          <button
            key={mood}
            onClick={() => onMood(mood)}
            className="rounded-lg text-left"
            style={{
              background: "rgba(255,255,255,0.05)",
              borderLeft: `5px solid ${STRIPES[i % STRIPES.length]}`,
              border: `1px solid ${colors.ring}`,
              borderLeftWidth: 5,
              borderLeftColor: STRIPES[i % STRIPES.length],
              padding: "16px 14px", cursor: "pointer",
              fontFamily: bodyFont, fontSize: 14.5, fontWeight: 600, color: colors.text,
            }}
          >
            {mood}
          </button>
        ))}
      </div>
    </div>
  );
}
