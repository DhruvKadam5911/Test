import React, { useRef, useState } from "react";
import { colors } from "../theme";
import PickerWheel from "./PickerWheel";
import OnionMark from "./shared/OnionMark";
import { PLATFORMS } from "../data/platforms";
import {
  TARGET_INDEX,
  START_INDEX,
  SPINS,
  SPIN_MS,
  MARK_HEIGHT,
  MARK_SWAP_MS,
  ISOLATE_AFTER_MS,
  ZOOM_AFTER_MS,
  ZOOM_MS,
  ZOOM_SCALE,
  FADE_MS,
} from "./splash/wheelTiming";

export default function SplashWheel({ onDone }) {
  const [visible, setVisible] = useState(true);

  // Set once the wheel lands: swaps the arrow marker for the brand mark.
  const [settled, setSettled] = useState(false);
  const [isolate, setIsolate] = useState(false);
  const [zooming, setZooming] = useState(false);
  // Origin of the push, measured from the real lockup so the zoom comes
  // through the logo rather than the middle of an empty screen.
  const [zoomOrigin, setZoomOrigin] = useState("30% 50%");
  const stageRef = useRef(null);
  const markerRef = useRef(null);

  // The wheel drives the timeline: it reports when it has landed on Onion,
  // and only then does the splash hold, fade and hand over.
  const handleSettled = (activeEl) => {
    setSettled(true);

    // The lockup is the mark plus the landed name. Measure their union so the
    // push starts from its centre on any viewport, instead of a guessed
    // percentage that drifts as the layout changes.
    const stage = stageRef.current;
    const marker = markerRef.current;
    if (stage && activeEl && marker) {
      const base = stage.getBoundingClientRect();
      const a = marker.getBoundingClientRect();
      const b = activeEl.getBoundingClientRect();
      const cx = (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2 - base.left;
      const cy = (Math.min(a.top, b.top) + Math.max(a.bottom, b.bottom)) / 2 - base.top;
      setZoomOrigin(`${cx}px ${cy}px`);
    }

    setTimeout(() => setIsolate(true), ISOLATE_AFTER_MS);
    setTimeout(() => {
      setZooming(true);
      setVisible(false);
    }, ZOOM_AFTER_MS);
    setTimeout(() => onDone?.(), ZOOM_AFTER_MS + ZOOM_MS);
  };

  return (
    <div
      className="fixed inset-0"
      style={{
        zIndex: 200,
        background: colors.bg,
        opacity: visible ? 1 : 0,
        // Delayed so the camera is already moving before the splash dissolves.
        transition: `opacity ${FADE_MS}ms ease ${zooming ? ZOOM_MS - FADE_MS : 0}ms`,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
        <div
          ref={stageRef}
          style={{
            height: "100%",
            transform: zooming ? `scale(${ZOOM_SCALE})` : "scale(1)",
            transformOrigin: zoomOrigin,
            // Accelerating, like a camera pushing through the logo — an
            // ease-out here would read as the lockup drifting, not rushing.
            transition: `transform ${ZOOM_MS}ms cubic-bezier(.45,0,.9,.6)`,
            willChange: "transform",
          }}
        >
        <PickerWheel
          items={PLATFORMS}
          itemHeight={104}
          startAt={START_INDEX}
          stopAt={TARGET_INDEX}
          spins={SPINS}
          spinMs={SPIN_MS}
          onSettled={handleSettled}
          isolate={isolate}
          marker={
            // Arrow and mark are stacked in one fixed box so the swap cannot
            // reflow the names beside them. The box is sized to the mark, the
            // larger of the two.
            <span
              ref={markerRef}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: MARK_HEIGHT * 0.37,
                height: MARK_HEIGHT,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  opacity: settled ? 0 : 1,
                  transform: settled ? "translateX(-10px) scale(0.8)" : "translateX(0) scale(1)",
                  transition: "opacity 200ms ease, transform 200ms ease",
                }}
              >
                →
              </span>
              <OnionMark
                height={MARK_HEIGHT}
                style={{
                  position: "absolute",
                  opacity: settled ? 1 : 0,
                  // Overshoots slightly past full size before settling, which
                  // gives the mark a stamped-on feel rather than a fade-in.
                  transform: settled
                    ? "scale(1) translateY(0) rotate(0deg)"
                    : "scale(0.3) translateY(14px) rotate(-12deg)",
                  filter: settled ? "blur(0px)" : "blur(10px)",
                  transition: `opacity 240ms ease, filter 300ms ease, transform ${MARK_SWAP_MS}ms cubic-bezier(.34,1.56,.64,1)`,
                }}
              />
            </span>
          }
            style={{ height: "100%" }}
          />
        </div>
    </div>
  );
}
