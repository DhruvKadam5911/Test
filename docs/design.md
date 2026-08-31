# Onion TV — Design System

> **Status:** Living document. Last updated 2026-08-31.
> Update this file whenever tokens, typography, component styling conventions, or motion change.
> **The source of truth for colors is `src/theme.js`.** This document explains it; it does not replace it.

---

## 1. Brand foundation

The palette is sampled directly from the official Onion logo — a purple bulb with a green
sprout. Every accent in the product traces back to a part of that mark. The product reads as
a dark, cinematic, near-black surface with purple as the single hero color and green used
sparingly as a live/active signal.

---

## 2. Color tokens

From `src/theme.js`. **Never hardcode these hex values in a component — import `colors`.**

| Token | Hex | Sampled from | Use for |
|-------|-----|--------------|---------|
| `bg` | `#0C0812` | — | Page background. Near-black with a purple undertone |
| `bgElevated` | `#161021` | — | Nav background, skeleton fills |
| `bgCard` | `#1D1629` | — | Card surfaces, `<option>` backgrounds |
| `text` | `#F3F0F5` | — | Primary text, primary button fill |
| `textMuted` | `#9C93A8` | — | Secondary text, metadata, footer links |
| `accent` | `#7B2685` | Onion bulb body | Primary purple — play button, badges |
| `accentDark` | `#591762` | Outer shell & roots | Deep purple |
| `accentLight` | `#B84DBF` | Inner layer curves | Eyebrow labels, episode counts, highlights |
| `accentGreen` | `#61A825` | Sprout | Live/active dot |
| `accentSprout` | `#78BF31` | Sprout tip | Green highlight |
| `ring` | `#2B1E38` | — | Borders, dividers, card outlines |

**Consistency note:** a few places use `#7C3FC4` (the play button's glow shadow, the splash
overlay chrome, the `index.html` text selection color) rather than `colors.accent` `#7B2685`.
These are close but not identical. Treat `colors.accent` as correct and migrate strays.

---

## 3. Typography

Loaded in `index.html` and re-imported inside `Home.jsx`.

| Family | Weights | Role |
|--------|---------|------|
| **Inter** | 400, 500, 600, 700 | Everything — both `displayFont` and `bodyFont` in `theme.js` |
| **Fraunces** | 500, 600 (opsz 9–144) | Loaded but **currently unused** — available if a serif display voice is wanted |

### Scale in use

| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| Hero title | `clamp(42px, 6vw, 64px)` | 600 | `letterSpacing: -0.02em`, `lineHeight: 1.05` |
| Section / row title | 13–15px | 700 | Often uppercase |
| Eyebrow label | 12px | 700 | Uppercase, `letterSpacing: 0.14em`, `accentLight` |
| Body / description | 15px | 400 | `lineHeight: 1.6`, `maxWidth: 520` |
| Metadata line | 13.5px | 500 | `textMuted`, dot-separated |
| Card title | 13px | — | |
| Badge / pill | 11px | 700 | |

---

## 4. Layout

- **Horizontal padding:** `px-6 md:px-10` on every full-width section.
- **Content max width:** `max-w-7xl mx-auto` for the hero's inner column.
- **Hero height:** `min-h-[82vh] md:min-h-[85vh]`, full-bleed.
- **Watch page:** 12-column grid — `lg:col-span-8` player + info, remainder for the sidebar.
- **Player:** always `aspect-video` (16:9).
- **Scrollbars:** hidden globally via `::-webkit-scrollbar { display: none }`.
- **Page:** `overflow-x-hidden` on the Home wrapper.

### Card sizes (`ContentCard.jsx`)

| Size | Width | Height |
|------|-------|--------|
| `lg` | 260px | 146px |
| `md` | 200px | 112px |

`CardSkeleton` mirrors these exactly — keep them in sync if either changes.

---

## 5. Radii, borders, shadows

| Property | Value | Applies to |
|----------|-------|------------|
| Border radius | 3–4px | Buttons, badges, pills |
| Border radius | 6px | Cards, skeletons |
| Border radius | 8px (`rounded-lg`) | Player surface |
| Border radius | 16px (`rounded-2xl`) | Splash overlay card |
| Border | `1px solid colors.ring` | Cards, inputs, dividers, player |
| Play button shadow | `0 4px 16px rgba(124,63,196,0.4)` → `0 6px 20px rgba(124,63,196,0.55)` on hover | Purple glow |

---

## 6. Motion

| Interaction | Transition |
|-------------|------------|
| Button hover | `transform 180ms ease` — `scale(1.08)` |
| Button press | `scale(0.95)` |
| Hero buttons | `hover:scale-105`, `duration-180` |
| Overlay panel | `transition-all duration-300` |
| Loading | Tailwind `animate-pulse` |

### Splash intro timeline (`SplashIntro.jsx`)

The splash is a `PickerWheel` spun onto the brand. There is no wordmark, no icon and no
writing effect — the wheel *is* the intro.

| Time | Visual | Audio |
|------|--------|-------|
| 0ms | Wheel starts spinning from `START_INDEX` | C2 sub-bass swell (65.4Hz sine), 0.5s fade-in; C major pentatonic arpeggio across the spin |
| 0–2600ms | One full turn plus the travel back to Onion, decelerating on `easeOutCubic` | A tick each time the wheel crosses an item — the last 9 crossings, so they thin out as it slows |
| 2600ms | Locks on **Onion**, crisp | C major chime chord (C5/E5/G5/C6, 20ms strum) + noise transient + feedback-delay tail |
| 3000ms | Splash begins to fade | — |
| 3420ms | `onDone()` | — |

The audio is fully synthesized with the Web Audio API — no audio files are shipped.

**The ticks are derived, not guessed.** `easeOutCubic` is `y = 1−(1−p)³`, so the wheel crosses
item *k* at `p = 1 − ∛(1 − k/distance)`. `crossingTimes()` inverts the easing to place each tick
exactly on an item, which is why the sound decelerates in lockstep with the wheel instead of
drifting against it. Change `SPIN_MS`, `SPINS` or `START_INDEX` and the ticks retime themselves.

**The wheel owns the timeline.** `PickerWheel` calls `onSettled` when it lands, and only then
does the splash hold, fade and hand over — the exit is not on an independent timer that could
drift out of sync with the animation.

---

## 7. Backgrounds: gradient or image

`thumbnailUrl` and `heroImageUrl` hold **either** a CSS gradient string **or** a real image
URL. Always render them through the `theme.js` helpers, which detect the difference:

| Helper | Returns | Use as |
|--------|---------|--------|
| `resolveBackground(value)` | `linear-gradient(...)` or `url("…") center/cover no-repeat` | `background` shorthand — cards, player poster |
| `resolveBackgroundImage(value)` | `linear-gradient(...)` or `url("…")` | `background-image`, paired with explicit `backgroundSize` / `backgroundPosition` — hero |

Both fall back to `FALLBACK_GRADIENT` (`linear-gradient(135deg, #3A1F22, #17141A)`) when the
value is empty. Six placeholder gradients live in `src/data/videos.js` as `gradients`.

**Never** write `background: url(${title.thumbnailUrl})` directly — it breaks for every
gradient-backed title, which is currently all of them.

---

## 8. Shared visual components

| Component | Role |
|-----------|------|
| `shared/OnionLogo.jsx` | The wordmark + bulb. Takes `height`. Used in navbar, footer, splash |
| `shared/RingMotif.jsx` | Large concentric-ring decoration. Takes `size`, `opacity`, `style`. Hero background |
| `shared/SmallRing.jsx` | Compact ring bullet before section titles |
| `PickerWheel.jsx` | Slot-machine list that rotates a set of labels past a fixed `→` marker. Reusable — takes `items`, `itemHeight`, `stepMs`, `onActiveChange`. Demoed at `/wheel` |

The concentric ring is the brand's secondary motif — an onion cross-section. Use it to mark
sections, not as generic decoration.

---

## 8b. PickerWheel motion

`PickerWheel.jsx` reproduces an off-screen wheel. Every item shares one pivot
`PIVOT_RADIUS` (900px) to the **left** of the list and is rotated about it by its distance from
the marker, `ANGLE_PER_ITEM` (7.2°) apart. That single rotation produces the entire effect:
items fan along an arc, tilt as they climb away from centre, and drift horizontally by
`R·(1−cos θ)` — exactly what a real wheel axis would do.

**Do not rewrite this as `translateY` + `rotate`.** The curve is the effect; a vertical
translate with an independent rotation looks flat and wrong.

Depth of field is interpolated from that same distance — `blur = d²·0.9`px,
`opacity = 1 − d·0.24`, `scale = 1 − d·0.055` — so nothing keys off a discrete "active index"
and motion stays continuous between steps.

One step is a `STEP_MOVE_MS` (420ms) eased move plus a `STEP_HOLD_MS` (250ms) rest on the
marker, ~665ms per item. Transforms are written straight to the DOM from a `requestAnimationFrame`
loop rather than through React state, so a 60fps animation does not re-render the tree each frame.
`prefers-reduced-motion: reduce` holds item 0 on the marker instead of spinning.

---

## 9. Styling conventions

This codebase mixes two systems on purpose. Match what the file already does:

- **Tailwind classes** for layout — flex, grid, spacing, responsive breakpoints, `aspect-video`.
- **Inline `style={{}}`** for anything token-driven — colors, font sizes, borders, shadows.

Rationale: the palette is not in the Tailwind config, so colors must come from `theme.js` at
runtime. Do not introduce a third system (CSS modules, styled-components) without updating
this document.

---

## 10. Dark mode

There is no light mode. `<html class="dark">` is hardcoded in `index.html` and every token
assumes a dark surface. Do not add `prefers-color-scheme` handling without a product decision.
