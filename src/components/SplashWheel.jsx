import React, { useRef, useState } from "react";
import { colors } from "../theme";
import PickerWheel from "./PickerWheel";
import OnionMark from "./shared/OnionMark";
import OnionWordmark from "./shared/OnionWordmark";
import { PLATFORMS } from "../data/platforms";
import {
  TARGET,
  TARGET_INDEX,
  START_INDEX,
  SPINS,
  SPIN_MS,
  MARK_HEIGHT,
  ITEM_HEIGHT,
  MARK_SWAP_MS,
  ISOLATE_AFTER_MS,
  CENTRE_AFTER_MS,
  CENTRE_MS,
  ZOOM_AFTER_MS,
  ZOOM_MS,
  ZOOM_SCALE,
  FADE_MS,
} from "./splash/wheelTiming";

export default function SplashWheel({ onDone, fullscreen = true, itemHeight = ITEM_HEIGHT }) {
  // Everything is sized off itemHeight so the same intro works as a
  // full-screen splash and as a pre-roll inside the player's 16:9 box.
  const scale = itemHeight / ITEM_HEIGHT;
  const markHeight = MARK_HEIGHT * scale;

  const [visible, setVisible] = useState(true);

  // Set once the wheel lands: swaps the arrow marker for the brand mark.
  const [settled, setSettled] = useState(false);
  const [isolate, setIsolate] = useState(false);
  const [zooming, setZooming] = useState(false);
  const [centred, setCentred] = useState(false);
  // How far the lockup has to travel to sit in the middle of the frame. The
  // wheel is left-aligned by design, so the lockup ends up off-centre and the
  // push would otherwise come from the side of the frame rather than through
  // the middle of it.
  const [centreOffset, setCentreOffset] = useState([0, 0]);
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
    // push has a real centre on any viewport instead of a guessed percentage.
    //
    // Measure the marker element, not the mark's <img>: OnionMark crops a wide
    // raster with overflow, so the image's own rect is several times the width
    // you actually see and would drag the centre well off.
    const stage = stageRef.current;
    const marker = markerRef.current;
    if (stage && activeEl && marker) {
      const base = stage.getBoundingClientRect();
      const a = marker.getBoundingClientRect();
      const b = activeEl.getBoundingClientRect();
      const cx = (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2 - base.left;
      const cy = (Math.min(a.top, b.top) + Math.max(a.bottom, b.bottom)) / 2 - base.top;
      setZoomOrigin(`${cx}px ${cy}px`);
      // Translating the stage does not move its transform-origin, so the push
      // still scales about the lockup once it has been recentred.
      setCentreOffset([base.width / 2 - cx, base.height / 2 - cy]);
    }

    setTimeout(() => setIsolate(true), ISOLATE_AFTER_MS);
    setTimeout(() => setCentred(true), CENTRE_AFTER_MS);
    setTimeout(() => {
      setZooming(true);
      setVisible(false);
    }, ZOOM_AFTER_MS);
    setTimeout(() => onDone?.(), ZOOM_AFTER_MS + ZOOM_MS);
  };

  return (
    <div
      className={fullscreen ? "fixed inset-0" : "absolute inset-0 overflow-hidden"}
      style={{
        zIndex: fullscreen ? 200 : 20,
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
            // One property, two phases: glide to the middle, then push through
            // it. The translate stays applied during the zoom so the lockup
            // does not snap back to the side as it grows.
            transform:
              `translate(${centred ? centreOffset[0] : 0}px, ${centred ? centreOffset[1] : 0}px)` +
              ` scale(${zooming ? ZOOM_SCALE : 1})`,
            transformOrigin: zoomOrigin,
            transition: zooming
              // Accelerating, like a camera pushing through the logo — an
              // ease-out here would read as the lockup drifting, not rushing.
              ? `transform ${ZOOM_MS}ms cubic-bezier(.45,0,.9,.6)`
              : `transform ${CENTRE_MS}ms cubic-bezier(.16,1,.3,1)`,
            willChange: "transform",
          }}
        >
        <PickerWheel
          items={PLATFORMS}
          itemHeight={itemHeight}
          startAt={START_INDEX}
          stopAt={TARGET_INDEX}
          spins={SPINS}
          spinMs={SPIN_MS}
          onSettled={handleSettled}
          isolate={isolate}
          renderLabel={(label) =>
            label === TARGET ? (
              // Our own name is the wordmark, not type. Sized to the text's
              // x-height so it sits on the same optical line as the platforms
              // it is spinning past.
              <OnionWordmark height={itemHeight * 0.44} color={colors.text} />
            ) : (
              label
            )
          }
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
                width: markHeight * 0.37,
                height: markHeight,
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
                height={markHeight}
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
