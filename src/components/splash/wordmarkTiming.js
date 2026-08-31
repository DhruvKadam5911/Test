// Geometry and cadence for the desktop wordmark intro. Kept apart from the
// component because the soundtrack is derived from LETTER_STAGGER, and a
// module exporting both a component and plain values breaks Fast Refresh.

// Pixel bounds measured from public/logo.png (1024x512): the bulb+sprout icon
// occupies x:199-388. The wordmark is rendered as live text instead, so it can
// animate letter by letter rather than being cropped from the flattened image.
//
// The wordmark is set in Mr Bedfort — a joined script, so it reads as
// handwriting rather than type. Lowercase, loaded in index.html.
export const SOURCE_W = 1024;
export const SOURCE_H = 512;
export const ICON_LEFT = 199;
export const ICON_RIGHT = 388;
export const ICON_HEIGHT = 190;
export const WORD = "onion";
export const WORDMARK_FONT = "'Mr Bedfort', cursive";
// Script faces carry a small x-height for their em size, so the wordmark has
// to be set much larger than a sans would be to sit level with the icon.
export const WORDMARK_SIZE = 132;

// Handwriting cadence. Because the letters are joined, the word is revealed
// by a single nib travelling left to right rather than by animating each
// glyph: letters emerge one after another as the stroke passes them, which is
// how writing actually reads. LETTER_STAGGER also drives the per-letter
// whoosh in playIntroSound — keep the two in step or the sound drifts away
// from the strokes.
export const LETTER_STAGGER = 140; // ms between letters
export const LETTER_DRAW = 220; // ms for the final letter to finish
export const WRITE_DURATION = (WORD.length - 1) * LETTER_STAGGER + LETTER_DRAW;
