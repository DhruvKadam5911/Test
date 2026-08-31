// ---- Shared Design Tokens sampled directly from the official Onion logo ----
export const colors = {
  bg: "#0C0812",           // near-black background with subtle deep purple undertone
  bgElevated: "#161021",   // elevated panels, nav background
  bgCard: "#1D1629",       // card backgrounds
  text: "#F3F0F5",         // soft white primary text
  textMuted: "#9C93A8",    // secondary muted text
  accent: "#7B2685",       // primary purple (from onion bulb body)
  accentDark: "#591762",   // deep purple outline (from outer shell & roots)
  accentLight: "#B84DBF",  // magenta/lavender (from inner onion layer curves)
  accentGreen: "#61A825",  // fresh green (from the sprout top)
  accentSprout: "#78BF31", // light green sprout tip highlight
  ring: "#2B1E38",         // dark purple border / dividers
};

// Tokens are hex, but overlays need them at partial opacity. Going through
// here keeps those cases on the palette instead of drifting to a hand-picked
// near-miss (there used to be a stray #7C3FC4 alongside accent's #7B2685).
export function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const displayFont = "'Inter', system-ui, sans-serif";
export const bodyFont = "'Inter', system-ui, sans-serif";

export const FALLBACK_GRADIENT = "linear-gradient(135deg, #3A1F22, #17141A)";

function isCssGradient(value) {
  return /^(linear|radial|conic)-gradient\(/.test(value) || value.startsWith("url(");
}

// Thumbnail/hero fields hold either a CSS gradient placeholder or a real image URL.
// Used as a `background` shorthand value (e.g. card thumbnails, player poster).
export function resolveBackground(value, fallback = FALLBACK_GRADIENT) {
  if (!value) return fallback;
  return isCssGradient(value) ? value : `url("${value}") center/cover no-repeat`;
}

// Used as a `background-image` value paired with separate backgroundSize/backgroundPosition (e.g. hero banner).
export function resolveBackgroundImage(value, fallback = FALLBACK_GRADIENT) {
  if (!value) return fallback;
  return isCssGradient(value) ? value : `url("${value}")`;
}
