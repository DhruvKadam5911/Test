/*
 * The "onion" wordmark, constructed rather than typeset.
 *
 * The construction intro deconstructs the word into anchor points and outlines,
 * and that only looks deliberate if the letterforms actually ARE geometry —
 * circles, arcs and stems whose nodes land on quadrant points. A webfont's
 * outlines carry dozens of arbitrary anchors and would read as noise, so the
 * five glyphs are authored here instead. No font is loaded for the wordmark.
 *
 * Coordinate system, per letter, before its x offset is applied:
 *   y = 0    x-height (top of o, n)
 *   y = 50   centre line
 *   y = 100  baseline
 * Strokes are monoline: the same paths carry the wireframe (thin) and the
 * solid wordmark (thick), so one animated property covers the whole reveal.
 */

export const X_HEIGHT_TOP = 0;
export const CENTRE_LINE = 50;
export const BASELINE = 100;

export const STROKE_WIREFRAME = 2;
export const STROKE_SOLID = 20;

const LETTER_GAP = 30;

// `o` — a ring. Nodes at the four quadrants.
const o = {
  width: 100,
  paths: ["M 0,50 A 50,50 0 1 1 100,50 A 50,50 0 1 1 0,50 Z"],
  anchors: [
    [0, 50],
    [50, 0],
    [100, 50],
    [50, 100],
  ],
};

// `n` — a stem that turns into a semicircular shoulder and back down.
const n = {
  width: 100,
  paths: ["M 0,100 L 0,50 A 50,50 0 0 1 100,50 L 100,100"],
  anchors: [
    [0, 100],
    [0, 50],
    [50, 0],
    [100, 50],
    [100, 100],
  ],
};

// `i` — a short stem plus a tittle. The tittle's radius tracks the stroke
// width, so it thickens with the rest of the word instead of being a fixed dot.
const i = {
  width: 16,
  paths: ["M 8,100 L 8,45"],
  tittle: [8, 14],
  anchors: [
    [8, 100],
    [8, 45],
    [8, 14],
  ],
};

const WORD = [o, n, i, o, n];

// Lay the glyphs out left to right and bake the offsets in, so every consumer
// (paths, anchors, seed dots) reads the same absolute coordinates.
let cursor = 0;
export const LETTERS = WORD.map((glyph) => {
  const x = cursor;
  cursor += glyph.width + LETTER_GAP;
  return {
    x,
    width: glyph.width,
    centre: [x + glyph.width / 2, CENTRE_LINE],
    paths: glyph.paths.map((d) => translatePath(d, x)),
    tittle: glyph.tittle ? [glyph.tittle[0] + x, glyph.tittle[1]] : null,
    anchors: glyph.anchors.map(([ax, ay]) => [ax + x, ay]),
  };
});

export const WORDMARK_WIDTH = cursor - LETTER_GAP;

export const ANCHORS = LETTERS.flatMap((l) => l.anchors);

// Guides: the three lines the letterforms are actually built on.
export const GUIDES = [X_HEIGHT_TOP, CENTRE_LINE, BASELINE];

// Shifts every absolute x in a path command string. The paths above only use
// absolute M/L/A, so shifting the x of each coordinate pair is enough.
function translatePath(d, dx) {
  if (!dx) return d;
  return d.replace(/([ML])\s(-?[\d.]+),(-?[\d.]+)/g, (_, cmd, x, y) => `${cmd} ${Number(x) + dx},${y}`)
    .replace(/A\s([\d.]+),([\d.]+)\s(\d)\s(\d)\s(\d)\s(-?[\d.]+),(-?[\d.]+)/g,
      (_, rx, ry, rot, laf, sf, x, y) => `A ${rx},${ry} ${rot} ${laf} ${sf} ${Number(x) + dx},${y}`);
}
