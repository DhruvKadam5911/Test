import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { colors } from "../theme";

// Pixel bounds measured from public/logo.png (1024x512): the bulb+sprout icon
// occupies x:199-388. The wordmark is rendered as live text instead, so it can
// animate letter by letter rather than being cropped from the flattened image.
//
// "Netflix Sans" is Netflix's own proprietary, licensed typeface — it isn't
// distributed publicly, so we use Inter here instead: it's the site's
// existing brand font, rendered thin-weight (300) with a solid fill.
const SOURCE_W = 1024;
const SOURCE_H = 512;
const ICON_LEFT = 199;
const ICON_RIGHT = 388;
const ICON_HEIGHT = 190;
const WORD = "ONION";
const WORDMARK_FONT = "'Inter', system-ui, sans-serif";

export default function SplashIntro({ onDone }) {
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
    if (measureRef.current) setTextWidth(measureRef.current.scrollWidth);
  }, []);

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

  const letterStyle = (i) => ({
    display: "inline-block",
    fontFamily: WORDMARK_FONT,
    fontWeight: 300,
    fontSize: 68,
    lineHeight: 1,
    letterSpacing: "0.03em",
    color: colors.text,
    marginRight: i < WORD.length - 1 ? 8 : 0,
  });

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
        {WORD.split("").map((ch, i) => (
          <span key={i} style={letterStyle(i)}>{ch}</span>
        ))}
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
          <div className="flex" style={{ perspective: 400, width: textWidth }}>
            {WORD.split("").map((ch, i) => (
              <span
                key={i}
                style={{
                  ...letterStyle(i),
                  opacity: textIn ? 1 : 0,
                  filter: textIn ? "blur(0px)" : "blur(6px)",
                  transform: textIn
                    ? "scale(1) rotateX(0deg)"
                    : "scale(0.35) rotateX(55deg) translateY(10px)",
                  transition: `opacity 400ms ease ${i * 70}ms, filter 400ms ease ${i * 70}ms, transform 460ms cubic-bezier(.16,1,.3,1) ${i * 70}ms`,
                }}
              >
                {ch}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
