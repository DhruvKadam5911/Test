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

### Splash intro (`SplashIntro.jsx`)

**There are two intros, chosen by viewport width at mount.**

| Viewport | Component | Intro |
|----------|-----------|-------|
| `≥ 768px` (tablet, desktop) | `SplashConstruct.jsx` | The wordmark is *built*: dots multiply, become the letterforms' anchor points, outlines draw between them over construction guides, then thicken into the solid wordmark |
| `< 768px` (phone) | `SplashWheel.jsx` | The wheel spins through streaming services, locks on Onion, then pushes through the logo |

The split exists because the horizontal lockup needs width to read, and a phone does not have
it; the wheel's tall stack, conversely, reads poorly in a wide frame.

`SplashIntro.jsx` is only a shell: it picks the variant and owns the `AudioContext`. Each
variant owns its own visuals, timeline and exit, and ships its soundtrack in a sibling module
under `components/splash/`.

**The breakpoint is resolved once, on mount, and is deliberately not reactive** — a resize
part-way through would swap the entire intro mid-animation.

**Sound never gates the animation.** Browsers block audio on a domain the visitor has not
interacted with, so the context arrives suspended and there is nothing to play. The intro runs
silently in that case. It used to show a "click anywhere to play with sound" prompt instead,
which meant a first-time visitor on a real domain got a black screen and a permission dialog for
something they never asked for — it only looked fine in development because browsers relax the
policy for domains you visit repeatedly.

**Audio is scheduled inside the same effect that creates the context.** StrictMode
double-invokes effects in dev; because the context is created *and* played there, the discarded
pass is closed by the cleanup before it can be heard. Moving playback into a variant would
schedule twice onto one live context and double the soundtrack. That is also why the
soundtracks live in plain modules (`splash/wheelSound.js`, `splash/wordmarkSound.js`) rather
than being exported from the components — a module exporting both a component and a plain
function breaks Fast Refresh.

`SplashWheel` is used in two places: as the phone splash, and as the pre-roll ident in the
watch page's player. It takes `fullscreen` and `itemHeight`, and everything scales from
`itemHeight` — including the mark — so the same intro holds its proportions at either size.

#### Phone — the wheel

The wheel *is* the intro, and the brand mark arrives at the end of it.

| Time | Visual | Audio |
|------|--------|-------|
| 0ms | Wheel starts spinning from `START_INDEX`, arrow at the marker | C2 sub-bass swell (65.4Hz sine), 0.5s fade-in; C major pentatonic arpeggio across the spin |
| 0–2000ms | One full turn plus the travel back to Onion, decelerating on `easeOutCubic` | A tick each time the wheel crosses an item — the last 9 crossings, so they thin out as it slows |
| 2000ms | Locks on **Onion**, crisp | C major chime chord (C5/E5/G5/C6, 20ms strum) + noise transient + feedback-delay tail |
| 2000–2560ms | Arrow slides out; `OnionMark` (152px) drops in — scaling from 0.3 with a rotation and a blur, on an overshoot curve so it lands stamped rather than faded (`MARK_SWAP_MS`) | — |
| 2380ms | `isolate` — the losing platforms blur and fade out, leaving only the lockup | — |
| 2620ms | The push begins: the whole stage scales to `ZOOM_SCALE` (11x) on an accelerating curve, origin measured at the lockup's centre | — |
| 2920ms | Background starts dissolving, revealing the app already mounted behind | — |
| 3440ms | `onDone()` | — |

**The marker swap must not move the list.** The arrow and the mark are stacked absolutely
inside one fixed-size box sized to the mark, so the swap cannot reflow anything beside them.

**The push origin is measured, not guessed.** On settle, the splash takes the union of the
marker's and the landed item's bounding boxes and sets `transform-origin` to its centre. A
hardcoded percentage drifts off the logo as the viewport or the item widths change, and the
camera then appears to push through empty space next to the lockup.

**Order matters:** isolate before zoom. Scaling a screen still full of platform names reads as
the whole list lunging forward; clearing them first makes it a push through the logo.

#### Tablet and desktop — the construction

| Time | Stage |
|------|-------|
| 0–320ms | A seed dot appears, then three, then five |
| 520ms | The five spread out, one per letter |
| 880ms | Each hands over to that letter's anchor points |
| 1120ms | Guides fade in; the outlines draw between the anchors (staggered 90ms per letter) |
| 1820ms | Scaffolding clears and the wireframe thickens into the solid wordmark |
| 2240ms | The onion mark joins it, at `MARK_HEIGHT` 280 — the source raster pads the bulb heavily, so its box runs about twice the letter height for the mark to read as the larger element |
| 2760ms | Fade out → `onDone()` at 3180ms |

**The letterforms are geometry, not type.** `splash/wordmarkGeometry.js` authors "onion" as
paths — `o` is a ring, `n` is a stem turning into a semicircular shoulder, `i` is a stem plus a
tittle. This is what makes the wireframe stage read as deliberate: every anchor lands on a
quadrant point. A webfont's outlines carry dozens of arbitrary anchors and would look like
noise. **No font is loaded for the wordmark at all.**

**The whole reveal rides on two properties of one set of paths.** `stroke-dashoffset` draws
them (each path carries `pathLength={1}`, so one normalised value works regardless of real
length), and `stroke-width` fills them — wireframe `2`, solid `20`. The `i`'s tittle radius is
derived from the same stroke width, so it thickens with the word instead of sitting there as a
fixed dot. Do not add a separate filled copy of the wordmark for the solid stage.

**The mark's space is reserved from the start** so its late fade-in cannot shift the wordmark
sideways — the same rule as the wheel's marker.

The audio is fully synthesized with the Web Audio API — no audio files are shipped.

**The ticks are derived, not guessed.** `easeOutCubic` is `y = 1−(1−p)³`, so the wheel crosses
item *k* at `p = 1 − ∛(1 − k/distance)`. `crossingTimes()` inverts the easing to place each tick
exactly on an item, which is why the sound decelerates in lockstep with the wheel instead of
drifting against it. Change `SPIN_MS`, `SPINS` or `START_INDEX` and the ticks retime themselves.

**The wheel owns the timeline.** `PickerWheel` calls `onSettled` when it lands, and only then
does the splash swap in the mark, hold, fade and hand over — the exit is not on an independent
timer that could drift out of sync with the animation.

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
| `shared/OnionLogo.jsx` | The full baked lockup (bulb + "ONION") from `public/logo.png`. Takes `height`. Navbar and footer |
| `shared/OnionMark.jsx` | The bulb-and-sprout **only**, cropped out of the same raster at runtime with the white background knocked out. Use it wherever the mark sits next to live text — the splash marker |
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
