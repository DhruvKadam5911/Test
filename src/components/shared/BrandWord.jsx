import React from "react";
import { colors } from "../../theme";
import { layOutWord, BASELINE, STROKE_SOLID } from "../splash/wordmarkGeometry";

/*
 * BrandWord — any word the brand can spell, in the brand's own letterforms.
 *
 * OnionWordmark draws "onion" and only "onion". This draws whatever it is
 * given, from the same rings, arcs and stems, so "music" beside the mark is the
 * same hand as the logo rather than a typeface standing in for it.
 *
 * Those letterforms are shapes, not a typeface: only the glyphs authored in
 * wordmarkGeometry exist. A word using any other letter returns null from the
 * layout and renders nothing rather than a word with holes in it — a caller
 * that needs a fallback should check for that.
 *
 * `height` is the visual height of the letters including the stroke, the same
 * as OnionWordmark, so the two line up when set to the same number.
 */

const VISUAL_HEIGHT = BASELINE + STROKE_SOLID;

export default function BrandWord({
  word,
  height = 40,
  color = colors.text,
  strokeWidth = STROKE_SOLID,
  className = "",
  style,
}) {
  const laid = layOutWord(word);
  if (!laid) return null;

  const pad = strokeWidth / 2;
  const scale = height / VISUAL_HEIGHT;

  return (
    <svg
      className={className}
      viewBox={`${-pad} ${-pad} ${laid.width + strokeWidth} ${BASELINE + strokeWidth}`}
      width={(laid.width + strokeWidth) * scale}
      height={height}
      role="img"
      aria-label={word}
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      {laid.letters.map((letter, i) =>
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

      {laid.letters
        .filter((l) => l.tittle)
        .map((l, i) => (
          <circle key={`tittle-${i}`} cx={l.tittle[0]} cy={l.tittle[1]} r={strokeWidth / 2} fill={color} />
        ))}
    </svg>
  );
}
