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
// Letters that end on a straight stem need less air after them than a circle
// does, or the word falls into pieces. Applied per glyph in layOutWord.
const TIGHT_GAP = 20;

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
  flatLeft: true,
  flatRight: true,
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
  flatLeft: true,
  flatRight: true,
  width: 16,
  paths: ["M 8,100 L 8,45"],
  tittle: [8, 14],
  anchors: [
    [8, 100],
    [8, 45],
    [8, 14],
  ],
};

/*
 * The rest of the alphabet the brand needs, built the same way: rings, arcs and
 * stems on the same three lines. `m` is `n` twice at half width; `u` is `n`
 * turned over; `c` is a ring with its right side left open; `s` is the one
 * shape here that is not a quadrant arc, since an s cannot be.
 */

// `m` — n twice: one stem, two shoulders, each three quarters of n's width so
// the whole glyph is 150 wide and fills it. The paths have to span the declared
// width or the layout leaves a hole after the letter.
const m = {
  flatRight: true,
  width: 150,
  paths: ["M 0,100 L 0,50 A 37.5,37.5 0 0 1 75,50 L 75,100 M 75,50 A 37.5,37.5 0 0 1 150,50 L 150,100"],
  anchors: [[0, 100], [0, 50], [37.5, 12.5], [75, 50], [75, 100], [112.5, 12.5], [150, 50], [150, 100]],
};

// `u` — n turned over: stems from the x-height down to the centre line, then a
// semicircular bowl to the baseline. Mirrors n's construction exactly.
const u = {
  flatLeft: true,
  flatRight: true,
  width: 100,
  paths: ["M 0,0 L 0,50 A 50,50 0 0 0 100,50 L 100,0"],
  anchors: [[0, 0], [0, 50], [50, 100], [100, 50], [100, 0]],
};

// `c` — the ring of o with its right quadrant left open.
const c = {
  width: 100,
  paths: ["M 100,25 A 50,50 0 1 0 100,75"],
  anchors: [[100, 25], [50, 0], [0, 50], [50, 100], [100, 75]],
};

/*
 * `s` — two arcs that meet on the centre line, the top one opening left and the
 * bottom one opening right.
 *
 * The only glyph here whose nodes are not on a circle's quadrants, because an s
 * has none to sit on. Drawn narrower than the round letters: at the same width
 * the two bowls read as a figure eight rather than an s.
 */
const s = {
  width: 78,
  paths: ["M 74,22 A 26,26 0 1 0 39,50 A 26,26 0 1 1 4,78"],
  anchors: [[74, 22], [39, 50], [4, 78]],
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

// Everything the brand can spell. Anything not here simply cannot be drawn in
// these letterforms — they are shapes, not a typeface with a full character set.
const GLYPHS = { o, n, i, m, u, s, c };

/**
 * Lay out an arbitrary word in the same letterforms.
 *
 * Returns null for a word containing a glyph that has not been drawn, so a
 * caller can fall back rather than render a gap.
 */
export function layOutWord(word) {
  const glyphs = [...String(word).toLowerCase()].map((ch) => GLYPHS[ch]);
  if (glyphs.some((g) => !g)) return null;

  let x = 0;
  const letters = glyphs.map((glyph, index) => {
    const at = x;
    const next = glyphs[index + 1];
    x += glyph.width + (glyph.flatRight || next?.flatLeft ? TIGHT_GAP : LETTER_GAP);
    return {
      x: at,
      width: glyph.width,
      paths: glyph.paths.map((d) => translatePath(d, at)),
      tittle: glyph.tittle ? [glyph.tittle[0] + at, glyph.tittle[1]] : null,
      anchors: glyph.anchors.map(([ax, ay]) => [ax + at, ay]),
    };
  });

  return { letters, width: x - LETTER_GAP };
}

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
