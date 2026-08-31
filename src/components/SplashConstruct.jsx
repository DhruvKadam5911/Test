import React, { useEffect, useState } from "react";
import { colors } from "../theme";
import OnionMark from "./shared/OnionMark";
import {
  LETTERS,
  ANCHORS,
  GUIDES,
  WORDMARK_WIDTH,
  STROKE_WIREFRAME,
  STROKE_SOLID,
} from "./splash/wordmarkGeometry";

/*
 * SplashConstruct — the desktop intro: the wordmark is built, not typed.
 *
 * A seed dot multiplies, the dots spread to sit one per letter, each opens out
 * into that letter's anchor points, the outlines draw between them over
 * construction guides, and finally the thin wireframe thickens into the solid
 * monoline wordmark and the mark joins it.
 *
 * The whole reveal rides on two properties of one set of paths —
 * `stroke-dashoffset` for the draw and `stroke-width` for the fill — which is
 * why the letterforms are authored as geometry in `splash/wordmarkGeometry.js`
 * rather than set in a font. See that file.
 */

// Stage gates. Each is the moment that stage begins.
const T = {
  SEEDS_3: 180,
  SEEDS_5: 320,
  SPREAD: 520,
  ANCHORS: 880,
  DRAW: 1120,
  SOLID: 1820,
  MARK: 2240,
  EXIT: 2760,
  DONE: 3180,
};

const DRAW_MS = 700;
const SOLID_MS = 420;
const FADE_MS = 420;
// The wordmark is sized in viewport units, so the mark has to be derived from
// the same basis. A fixed pixel height would look correct on one screen and
// tower over the letters on a narrower one — at 768 a fixed 360 put the mark
// at 4.2x the letter height against 3.0x on desktop.
const WORDMARK_VW = 0.66;
const WORDMARK_MAX_PX = 720;
// Mark height as a fraction of the wordmark's width. The source raster carries
// a lot of transparent padding around the bulb, so this runs high for the mark
// to read as the larger element.
const MARK_TO_WORDMARK = 0.5;

function wordmarkWidth() {
  return Math.min(window.innerWidth * WORDMARK_VW, WORDMARK_MAX_PX);
}

const S = { CLUSTER: 0, SPREAD: 1, ANCHORS: 2, DRAW: 3, SOLID: 4, MARK: 5 };

// Where the seed dots gather before they know which letter they are.
const CLUSTER_RADIUS = 30;
const CENTRE = [WORDMARK_WIDTH / 2, 50];

export default function SplashConstruct({ onDone }) {
  // Resolved once, like the breakpoint: the intro is over in three seconds and
  // resizing mid-animation would rescale the lockup underneath itself.
  const [markHeight] = useState(() => wordmarkWidth() * MARK_TO_WORDMARK);
  const [stage, setStage] = useState(S.CLUSTER);
  const [seeds, setSeeds] = useState(1);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timers = [
      setTimeout(() => setSeeds(3), T.SEEDS_3),
      setTimeout(() => setSeeds(5), T.SEEDS_5),
      setTimeout(() => setStage(S.SPREAD), T.SPREAD),
      setTimeout(() => setStage(S.ANCHORS), T.ANCHORS),
      setTimeout(() => setStage(S.DRAW), T.DRAW),
      setTimeout(() => setStage(S.SOLID), T.SOLID),
      setTimeout(() => setStage(S.MARK), T.MARK),
      setTimeout(() => setVisible(false), T.EXIT),
      setTimeout(() => onDone?.(), T.DONE),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  const drawn = stage >= S.DRAW;
  const solid = stage >= S.SOLID;
  // Guides and anchors are scaffolding: they belong to the wireframe stage only.
  const scaffolding = stage >= S.ANCHORS && !solid;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 200,
        background: colors.bg,
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="flex items-center" // The SVG carries 30 units of its own left padding for the guides, which
          // already reads as ~36px of gap, so this stays small.
          style={{ gap: 2 }}>
        {/* The mark's space is reserved from the start, so it fading in at the
            end cannot shift the wordmark sideways. */}
        <div style={{ width: markHeight * 0.37, flexShrink: 0 }}>
          <OnionMark
            height={markHeight}
            style={{
              opacity: stage >= S.MARK ? 1 : 0,
              transform: stage >= S.MARK ? "scale(1)" : "scale(0.4)",
              transition: "opacity 300ms ease, transform 520ms cubic-bezier(.34,1.56,.64,1)",
            }}
          />
        </div>

        <svg
          viewBox={`-30 -40 ${WORDMARK_WIDTH + 60} 180`}
          style={{ width: wordmarkWidth(), overflow: "visible" }}
          aria-label="onion"
        >
          {/* Construction guides */}
          {GUIDES.map((y) => (
            <line
              key={y}
              x1={-30}
              x2={WORDMARK_WIDTH + 30}
              y1={y}
              y2={y}
              stroke={colors.ring}
              strokeWidth={1}
              style={{
                opacity: scaffolding ? 1 : 0,
                transition: "opacity 300ms ease",
              }}
            />
          ))}

          {/* Letter outlines. pathLength normalises every path to 1 so a single
              dashoffset value draws them all regardless of real length. */}
          {LETTERS.map((letter, li) =>
            letter.paths.map((d) => (
              <path
                key={`${li}-${d}`}
                d={d}
                pathLength={1}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                stroke={solid ? colors.text : colors.accentLight}
                strokeWidth={solid ? STROKE_SOLID : STROKE_WIREFRAME}
                strokeDasharray={1}
                strokeDashoffset={drawn ? 0 : 1}
                style={{
                  transition:
                    `stroke-dashoffset ${DRAW_MS}ms ease ${li * 90}ms,` +
                    `stroke-width ${SOLID_MS}ms ease,` +
                    `stroke ${SOLID_MS}ms ease`,
                }}
              />
            ))
          )}

          {/* The i's tittle. Its radius tracks the stroke, so it thickens with
              the rest of the word instead of sitting there as a fixed dot. */}
          {LETTERS.filter((l) => l.tittle).map((l) => (
            <circle
              key="tittle"
              cx={l.tittle[0]}
              cy={l.tittle[1]}
              r={(solid ? STROKE_SOLID : STROKE_WIREFRAME) / 2}
              fill={solid ? colors.text : colors.accentLight}
              style={{
                opacity: drawn ? 1 : 0,
                transition: `r ${SOLID_MS}ms ease, fill ${SOLID_MS}ms ease, opacity 300ms ease 260ms`,
              }}
            />
          ))}

          {/* Anchor points — the nodes the outlines are drawn between */}
          {ANCHORS.map(([x, y], i) => (
            <circle
              key={`a-${i}`}
              cx={x}
              cy={y}
              r={4.5}
              fill={colors.accentLight}
              style={{
                opacity: scaffolding ? 1 : 0,
                transform: scaffolding ? "scale(1)" : "scale(0.2)",
                transformOrigin: `${x}px ${y}px`,
                transition: `opacity 260ms ease ${i * 14}ms, transform 320ms cubic-bezier(.34,1.56,.64,1) ${i * 14}ms`,
              }}
            />
          ))}

          {/* Seed dots — one per letter once there are five. They gather, then
              move out to the letter they will become, then hand over to the
              anchors and disappear. */}
          {LETTERS.map((letter, i) => {
            const angle = (-90 + i * 72) * (Math.PI / 180);
            const cluster = [
              CENTRE[0] + Math.cos(angle) * CLUSTER_RADIUS,
              CENTRE[1] + Math.sin(angle) * CLUSTER_RADIUS,
            ];
            const at = stage >= S.SPREAD ? letter.centre : cluster;
            return (
              <circle
                key={`s-${i}`}
                cx={0}
                cy={0}
                r={7}
                fill={colors.accentLight}
                style={{
                  opacity: stage < S.ANCHORS && i < seeds ? 1 : 0,
                  transform: `translate(${at[0]}px, ${at[1]}px)`,
                  transition:
                    "transform 460ms cubic-bezier(.16,1,.3,1), opacity 220ms ease",
                }}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
