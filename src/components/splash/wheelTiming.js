import { PLATFORMS } from "../../data/platforms";

// Timings and geometry for the wheel intro. They live apart from the
// component because the soundtrack is derived from them too, and a module
// that exports both a component and plain values breaks Fast Refresh.

export const TARGET = "Onion";
export const START_INDEX = 1; // begin on the item after the target, so it has to travel
export const SPINS = 1; // one full turn is plenty — more only lengthens the unreadable fast phase
export const SPIN_MS = 2000; // spin-up and deceleration onto the target
// The mark renders at 0.37x its height (the crop's aspect), so 152 is
// about 56px wide — still clear of the item column at left: 92.
export const MARK_HEIGHT = 152;
// The size the wheel was designed at. Rendering at any other size scales
// everything from this, so the proportions hold.
export const ITEM_HEIGHT = 104;
export const MARK_SWAP_MS = 560; // arrow out, brand mark in with an overshoot
export const ISOLATE_AFTER_MS = 380; // losing platforms clear away
export const ZOOM_AFTER_MS = 620; // camera starts pushing through the lockup
export const ZOOM_MS = 820;
export const ZOOM_SCALE = 11;
export const FADE_MS = 520; // background dropping away to reveal the app behind

export const TARGET_INDEX = Math.max(PLATFORMS.indexOf(TARGET), 0);

// Whole turns plus the forward travel from the starting item to the target.
export const DISTANCE =
  SPINS * PLATFORMS.length +
  ((((TARGET_INDEX - START_INDEX) % PLATFORMS.length) + PLATFORMS.length) % PLATFORMS.length);
