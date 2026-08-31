import React, { useEffect, useRef } from "react";
import { colors, displayFont } from "../theme";

/*
 * PickerWheel — a slot-machine list that rotates past a fixed marker.
 *
 * Every item shares one pivot point PIVOT_RADIUS pixels to the LEFT of the
 * list, and each is rotated about it by its distance from the marker. That
 * single transform produces the whole effect for free: items fan out along an
 * arc, tilt as they climb away from centre, and drift rightward as they go
 * (horizontal offset is R·(1−cos θ), which is exactly what an off-screen wheel
 * axis would do). Do not replace it with a translateY + rotate pair — the
 * curve is the point.
 *
 * Depth of field (blur, dim, shrink) is interpolated from the same distance,
 * so nothing is keyed to a discrete "active index" and the motion stays
 * continuous between steps.
 */

const PIVOT_RADIUS = 900; // px from the list to the wheel's axis, off to the left
const ANGLE_PER_ITEM = 7.2; // degrees between neighbours on the arc
const VISIBLE_RADIUS = 5; // items further out than this are not painted

// One step = a quick eased move, then a beat of rest on the marker.
const STEP_MOVE_MS = 420;
const STEP_HOLD_MS = 250;

const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

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
  onActiveChange,
  className = "",
  style,
}) {
  const itemRefs = useRef([]);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const n = items.length;

  useEffect(() => {
    if (!n) return;

    const paint = (pos) => {
      for (let i = 0; i < n; i++) {
        const el = itemRefs.current[i];
        if (!el) continue;

        const d = wrappedDistance(i, pos, n);
        const near = Math.min(Math.abs(d), VISIBLE_RADIUS);

        el.style.transform = `rotate(${d * ANGLE_PER_ITEM}deg) scale(${1 - near * 0.055})`;
        el.style.filter = `blur(${near * near * 0.9}px)`;
        el.style.opacity = String(Math.max(0, 1 - near * 0.24));
        el.style.fontWeight = Math.abs(d) < 0.5 ? 700 : 600;
      }
    };

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Hold the first item on the marker rather than spinning indefinitely.
      paint(0);
      onActiveChangeRef.current?.(0);
      return;
    }

    const moveMs = Math.min(STEP_MOVE_MS, stepMs);
    let raf = 0;
    let startedAt = null;
    let lastActive = -1;

    const tick = (t) => {
      if (startedAt === null) startedAt = t;
      const elapsed = t - startedAt;
      const step = Math.floor(elapsed / stepMs);
      const within = Math.min((elapsed - step * stepMs) / moveMs, 1);
      const pos = (step + easeInOutCubic(within)) % n;

      paint(pos);

      const active = Math.round(pos) % n;
      if (active !== lastActive) {
        lastActive = active;
        onActiveChangeRef.current?.(active);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, stepMs]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: colors.bg, ...style }}
    >
      {/* The marker the list rotates past. Fixed — the wheel moves, not this. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 28,
          top: "50%",
          transform: "translateY(-50%)",
          fontFamily: displayFont,
          fontSize: itemHeight * 0.42,
          lineHeight: 1,
          color: colors.text,
          zIndex: 2,
        }}
      >
        →
      </div>

      {items.map((label, i) => (
        <div
          key={`${label}-${i}`}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          style={{
            position: "absolute",
            left: 92,
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
          {label}
        </div>
      ))}
    </div>
  );
}
