import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { colors } from "../theme";
import {
  SOURCE_W,
  SOURCE_H,
  ICON_LEFT,
  ICON_RIGHT,
  ICON_HEIGHT,
  WORD,
  WORDMARK_FONT,
  WORDMARK_SIZE,
  WRITE_DURATION,
} from "./splash/wordmarkTiming";

export default function SplashWordmark({ onDone }) {
  const [src, setSrc] = useState(null);
  const [swooped, setSwooped] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [textIn, setTextIn] = useState(false);
  const [visible, setVisible] = useState(true);
  const [textWidth, setTextWidth] = useState(0);
  const measureRef = useRef(null);


  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = "/logo.png";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 220 && g > 220 && b > 220) {
          data[i + 3] = 0;
        } else if (r < 95 && g < 40 && b < 105) {
          data[i] = 243; data[i + 1] = 240; data[i + 2] = 245;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      setSrc(canvas.toDataURL("image/png"));
    };
  }, []);

  // Measure the wordmark's real rendered width so the reveal container can
  // grow to an exact pixel value instead of guessing.
  useLayoutEffect(() => {
    const measure = () => {
      if (measureRef.current) setTextWidth(measureRef.current.scrollWidth);
    };
    measure();

    // The first measurement can land before Poppins has loaded, which would
    // size the column to the fallback face and clip the wordmark. Re-measure
    // once the real font is in.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Visual Animation Timeline
  useEffect(() => {
    // 1) icon swoops in centered on screen (text column is 0-width so far)
    const swoopTimer = setTimeout(() => setSwooped(true), 60);
    // 2) once it's landed, open the text column — the icon visibly slides
    //    left as the centered group widens to make room
    const openTimer = setTimeout(() => setTextOpen(true), 680);
    // 3) shortly after, the letters swoop in one by one into the opened space
    const textTimer = setTimeout(() => setTextIn(true), 900);
    const hideTimer = setTimeout(() => setVisible(false), 2650);
    const doneTimer = setTimeout(() => onDone?.(), 3100);

    return () => {
      clearTimeout(swoopTimer);
      clearTimeout(openTimer);
      clearTimeout(textTimer);
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  const scale = ICON_HEIGHT / SOURCE_H;
  const imgWidth = SOURCE_W * scale;
  const iconLeftPx = ICON_LEFT * scale;
  const iconWidthPx = (ICON_RIGHT - ICON_LEFT) * scale;

  // Mr Bedfort is a joined script, so the word is set as ONE text run: no
  // per-letter elements, no letter-spacing, no margins. Splitting it into
  // spans would break the strokes that carry from one letter into the next.
  const wordStyle = {
    fontFamily: WORDMARK_FONT,
    fontWeight: 400,
    fontSize: WORDMARK_SIZE,
    lineHeight: 1.05,
    letterSpacing: "normal",
    color: colors.text,
    whiteSpace: "nowrap",
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 200,
        background: colors.bg,
        opacity: visible ? 1 : 0,
        transition: "opacity 450ms ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <style>{`
        @keyframes onionSplashBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>

      {/* Hidden measurer — same letters/font/spacing, used only to read the
          wordmark's true pixel width before it's ever shown. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        style={{ position: "absolute", visibility: "hidden", whiteSpace: "nowrap", top: -9999, left: -9999 }}
      >
        <span style={wordStyle}>{WORD}</span>
      </div>

      <div className="flex items-center" style={{ gap: textOpen ? 16 : 0, perspective: 700 }}>
        {/* Icon — swoops in centered, then the group widens as the text column
            opens, which visibly pushes the icon left. Settles into an idle bob. */}
        <div
          style={{
            height: ICON_HEIGHT,
            width: iconWidthPx,
            overflow: "hidden",
            position: "relative",
            transformStyle: "preserve-3d",
            transform: swooped
              ? "translateZ(0) rotateX(0deg) scale(1)"
              : "translateZ(-320px) rotateX(38deg) scale(2.8)",
            opacity: swooped ? 1 : 0,
            filter: swooped ? "blur(0px)" : "blur(16px)",
            transition:
              "transform 640ms cubic-bezier(.16,1,.3,1), opacity 260ms ease, filter 520ms ease",
            animation: swooped ? "onionSplashBob 2.2s ease-in-out 700ms infinite" : "none",
          }}
        >
          {src && (
            <img
              src={src}
              alt=""
              style={{
                position: "absolute",
                left: -iconLeftPx,
                top: 0,
                height: ICON_HEIGHT,
                width: imgWidth,
                maxWidth: "none",
              }}
            />
          )}
        </div>

        {/* Text column — grows from 0 to the wordmark's real width, which is
            what visually shifts the icon leftward; letters swoop in inside it. */}
        <div
          style={{
            width: textOpen ? textWidth : 0,
            overflow: "hidden",
            transition: "width 520ms cubic-bezier(.16,1,.3,1)",
          }}
        >
          <div className="relative" style={{ width: textWidth }}>
            {/* One text run, uncovered left to right. The ink edge advances at
                the same rate as the nib below, so letters surface in sequence
                as the stroke reaches them — joins intact. */}
            <span
              style={{
                ...wordStyle,
                display: "inline-block",
                clipPath: textIn ? "inset(-25% -12% -30% 0)" : "inset(-25% 100% -30% 0)",
                transition: `clip-path ${WRITE_DURATION}ms cubic-bezier(.42,0,.58,1)`,
              }}
            >
              {WORD}
            </span>

            {/* The nib — rides the ink edge, then lifts off once the word is
                written. Same duration and easing as the reveal, so the two
                never separate. */}
            {textWidth > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0,
                  top: "12%",
                  height: "76%",
                  width: 2,
                  borderRadius: 2,
                  background: `linear-gradient(to bottom, transparent, ${colors.accentLight}, ${colors.accentGreen})`,
                  boxShadow: `0 0 10px ${colors.accentLight}`,
                  opacity: textIn ? 0 : 1,
                  // The reveal sweeps to -12% (past the advance width, so the
                  // script's closing flourish isn't clipped). The nib has to
                  // cover that same 112% or the ink runs ahead of the pen.
                  transform: textIn ? `translateX(${Math.round(textWidth * 1.12)}px)` : "translateX(0px)",
                  transition: `transform ${WRITE_DURATION}ms cubic-bezier(.42,0,.58,1), opacity 220ms ease ${WRITE_DURATION - 120}ms`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
