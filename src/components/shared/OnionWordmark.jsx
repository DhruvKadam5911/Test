import React from "react";
import { colors } from "../../theme";
import {
  LETTERS,
  WORDMARK_WIDTH,
  BASELINE,
  STROKE_SOLID,
} from "../splash/wordmarkGeometry";

/*
 * OnionWordmark — "onion" as the brand draws it.
 *
 * The letterforms are the geometry in splash/wordmarkGeometry.js, the same
 * paths the desktop intro constructs. This is the static rendering of them, so
 * the wordmark reads identically wherever it appears — navbar, footer, the
 * wheel — and there is one place to change it.
 *
 * `height` is the visual height of the letters including the stroke, not an
 * em size: these are drawn shapes, not type, and "onion" has no ascenders or
 * descenders so what you set is what you see.
 */

const VISUAL_HEIGHT = BASELINE + STROKE_SOLID; // 120 units, cap of the drawn shape

export default function OnionWordmark({
  height = 40,
  color = colors.text,
  strokeWidth = STROKE_SOLID,
  className = "",
  style,
}) {
  const pad = strokeWidth / 2;
  const scale = height / VISUAL_HEIGHT;

  return (
    <svg
      className={className}
      viewBox={`${-pad} ${-pad} ${WORDMARK_WIDTH + strokeWidth} ${BASELINE + strokeWidth}`}
      width={(WORDMARK_WIDTH + strokeWidth) * scale}
      height={height}
      role="img"
      aria-label="onion"
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      {LETTERS.map((letter, i) =>
        letter.paths.map((d) => (
          <path
            key={`${i}-${d}`}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))
      )}

      {/* The i's tittle is a filled dot the width of the stroke, so it stays
          in proportion at any size. */}
      {LETTERS.filter((l) => l.tittle).map((l) => (
        <circle key="tittle" cx={l.tittle[0]} cy={l.tittle[1]} r={strokeWidth / 2} fill={color} />
      ))}
    </svg>
  );
}
