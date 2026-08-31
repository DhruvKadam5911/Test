import React, { useEffect, useRef } from "react";
import { colors, displayFont } from "../theme";

/*
 * PickerWheel — a slot-machine list that rotates past a fixed marker.
 *
 * Every item shares one pivot point PIVOT_RADIUS pixels to the LEFT of the
 * list, and each is rotated about it by its distance from the marker. That
 * single transform produces the whole effect for free: items fan out along an
 * arc, tilt as they climb away from centre, and drift horizontally by
 * R·(1−cos θ), which is exactly what an off-screen wheel axis would do. Do not
 * replace it with a translateY + rotate pair — the curve is the point.
 *
 * Depth of field (blur, dim, shrink) is interpolated from the same distance,
 * so nothing is keyed to a discrete "active index" and the motion stays
 * continuous between steps.
 *
 * Two modes:
 *   stopAt == null  → loops forever, stepping item to item (the demo look).
 *   stopAt != null  → spins up and decelerates onto that item, then calls
 *                     onSettled. This is what the splash uses.
 */

const PIVOT_RADIUS = 900; // px from the list to the wheel's axis, off to the left
const ANGLE_PER_ITEM = 7.2; // degrees between neighbours on the arc
const VISIBLE_RADIUS = 5; // items further out than this are not painted

// Looping mode: one step is a quick eased move, then a beat of rest.
const STEP_MOVE_MS = 420;
const STEP_HOLD_MS = 250;

const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);

// Signed distance from `pos` to item `i`, wrapped so the list is a loop:
// an item leaving the bottom re-enters from the top by the short way round.
function wrappedDistance(i, pos, n) {
  let d = ((((i - pos) % n) + n) % n);
  if (d > n / 2) d -= n;
  return d;
}

export default function PickerWheel({
  items,
  itemHeight = 96,
  stepMs = STEP_MOVE_MS + STEP_HOLD_MS,
  startAt = 0,
  stopAt = null,
  spins = 2,
  spinMs = 2400,
  onActiveChange,
  onSettled,
  marker,
  isolate = false,
  // Lets a caller draw an item as something other than text — the splash uses
  // it to set its own name in the brand wordmark while the other platforms
  // stay as plain type.
  renderLabel,
  // Where the names start. It has to clear whatever the marker is, so callers
  // that put something wide there (a brand mark rather than an arrow) pass a
  // larger value instead of the labels running underneath it.
  labelLeft = 92,
  markerLeft = 28,
  className = "",
  style,
}) {
  const itemRefs = useRef([]);
  const activeIndexRef = useRef(0);
  const cbRef = useRef({ onActiveChange, onSettled });
  cbRef.current = { onActiveChange, onSettled };

  const n = items.length;

  useEffect(() => {
    if (!n) return;

    // `motionBlur` is added on top of the depth-of-field blur. Without it the
    // fast part of a spin strobes: our blur is distance-based, so a list
    // flying past would otherwise be as crisp as one standing still.
    const paint = (pos, motionBlur = 0) => {
      for (let i = 0; i < n; i++) {
        const el = itemRefs.current[i];
        if (!el) continue;

        const d = wrappedDistance(i, pos, n);
        const near = Math.min(Math.abs(d), VISIBLE_RADIUS);

        el.style.transform = `rotate(${d * ANGLE_PER_ITEM}deg) scale(${1 - near * 0.055})`;
        el.style.filter = `blur(${near * near * 0.9 + motionBlur}px)`;
        el.style.opacity = String(Math.max(0, 1 - near * 0.24));
        el.style.fontWeight = Math.abs(d) < 0.5 ? 700 : 600;
      }
    };

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const settling = stopAt !== null && stopAt !== undefined;

    if (reduced) {
      // Never spin. Land on the target immediately so a splash still finishes.
      const rest = settling ? stopAt : startAt;
      paint(rest);
      const restIndex = ((rest % n) + n) % n;
      activeIndexRef.current = restIndex;
      cbRef.current.onActiveChange?.(restIndex);
      if (settling) cbRef.current.onSettled?.(itemRefs.current[restIndex]);
      return;
    }

    let raf = 0;
    let startedAt = null;
    let lastActive = -1;
    let lastPos = startAt;
    let lastT = null;

    const announce = (pos) => {
      const active = ((Math.round(pos) % n) + n) % n;
      activeIndexRef.current = active;
      if (active !== lastActive) {
        lastActive = active;
        cbRef.current.onActiveChange?.(active);
      }
    };

    // Total travel: whole turns, plus however far it is forward from the
    // starting item to the target.
    const forward = settling ? (((stopAt - startAt) % n) + n) % n : 0;
    const distance = spins * n + forward;

    const tick = (t) => {
      if (startedAt === null) {
        startedAt = t;
        lastT = t;
      }
      const elapsed = t - startedAt;

      let pos;
      let done = false;

      if (settling) {
        const p = Math.min(elapsed / spinMs, 1);
        pos = startAt + distance * easeOutCubic(p);
        done = p >= 1;
      } else {
        const step = Math.floor(elapsed / stepMs);
        const within = Math.min((elapsed - step * stepMs) / Math.min(STEP_MOVE_MS, stepMs), 1);
        pos = startAt + step + easeInOutCubic(within);
      }

      const dt = Math.max(t - lastT, 1);
      const itemsPerSecond = (Math.abs(pos - lastPos) / dt) * 1000;
      lastPos = pos;
      lastT = t;

      // Kept deliberately gentle: enough to stop the fast phase strobing,
      // but the centre item has to stay readable throughout. A high cap turns
      // the first half-second into unreadable mush, which reads as broken
      // rather than fast.
      paint(pos, Math.min(itemsPerSecond * 0.35, 5));
      announce(pos);

      if (done) {
        paint(pos, 0); // land crisp
        cbRef.current.onSettled?.(itemRefs.current[activeIndexRef.current]);
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, stepMs, startAt, stopAt, spins, spinMs]);

  // Clears the losing items away so only the landed one is left beside the
  // marker. Runs after the animation effect has finished, so there is no rAF
  // loop still writing opacity that would fight these transitions.
  useEffect(() => {
    if (!isolate) return;
    itemRefs.current.forEach((el, i) => {
      if (!el) return;
      el.style.transition = "opacity 260ms ease, filter 260ms ease";
      if (i !== activeIndexRef.current) {
        el.style.opacity = "0";
        el.style.filter = "blur(12px)";
      }
    });
  }, [isolate]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: colors.bg, ...style }}
    >
      {/* The marker the list rotates past. Fixed — the wheel moves, not this.
          Callers can replace it entirely (the splash swaps in the brand mark
          once the wheel lands). */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: markerLeft,
          top: "50%",
          transform: "translateY(-50%)",
          fontFamily: displayFont,
          fontSize: itemHeight * 0.42,
          lineHeight: 1,
          color: colors.text,
          zIndex: 2,
        }}
      >
        {marker ?? "→"}
      </div>

      {items.map((label, i) => (
        <div
          key={`${label}-${i}`}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          style={{
            position: "absolute",
            left: labelLeft,
            top: "50%",
            marginTop: -itemHeight / 2,
            height: itemHeight,
            display: "flex",
            alignItems: "center",
            whiteSpace: "nowrap",
            fontFamily: displayFont,
            fontSize: itemHeight * 0.62,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: colors.text,
            // The pivot sits off to the left; every item shares it.
            transformOrigin: `${-PIVOT_RADIUS}px 50%`,
            willChange: "transform, filter, opacity",
            opacity: 0,
          }}
        >
          {renderLabel ? renderLabel(label) : label}
        </div>
      ))}
    </div>
  );
}
