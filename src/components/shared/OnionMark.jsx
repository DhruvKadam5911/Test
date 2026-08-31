import React, { useEffect, useState } from "react";

/*
 * OnionMark — the bulb-and-sprout mark on its own, without the wordmark.
 *
 * public/logo.png is a flattened 1024x512 raster of mark + "ONION" on white.
 * There is no separate icon asset, so the mark is cropped out of it at runtime
 * and its white background knocked out to transparent. Use this wherever the
 * mark is needed next to live text; use OnionLogo when you want the full
 * baked lockup.
 */

// Pixel bounds measured from public/logo.png: the bulb+sprout occupies x:199-388.
const SOURCE_W = 1024;
const SOURCE_H = 512;
const ICON_LEFT = 199;
const ICON_RIGHT = 388;

// The mark is not centred in its own crop. Measuring the opaque pixels in that
// x-range: the ink's bounding box sits 3.1% below the crop's centre, and its
// centroid — where the weight actually is, since the bulb is heavy and the
// sprout is thin — sits 8.0% below. Centring the box therefore leaves the mark
// visibly low next to text. Lifting by the centroid offset makes `items-center`
// centre what you see rather than the empty box around it.
const INK_CENTROID_OFFSET = 0.08;

// The knockout is a loop over every pixel of a 1024x512 raster. Doing it per
// mount cost real frames: the mark appears in the splash, the watch-page ident,
// the navbar and the footer, and on the deployed site that work landed on the
// main thread while the intro's rAF loop was running, stretching a 3.8s ident
// past 5s. Process once per page, hand the same data URL to everyone.
let cachedMark = null;
let inFlight = null;

function loadMark() {
  if (cachedMark) return Promise.resolve(cachedMark);
  if (inFlight) return inFlight;

  inFlight = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = "/logo.png";
    img.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("2d context unavailable"));

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        // White page background → transparent.
        if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) {
          data[i + 3] = 0;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      cachedMark = canvas.toDataURL("image/png");
      resolve(cachedMark);
    };
  }).catch((err) => {
    // Let a later mount retry rather than caching the failure.
    inFlight = null;
    throw err;
  });

  return inFlight;
}

export default function OnionMark({ height = 96, className = "", style }) {
  // Already processed on this page: render on the first paint, no flash.
  const [src, setSrc] = useState(cachedMark);

  useEffect(() => {
    if (src) return;
    let cancelled = false;
    loadMark()
      .then((data) => {
        if (!cancelled) setSrc(data);
      })
      .catch((err) => console.error("OnionMark failed to load /logo.png:", err));
    return () => {
      cancelled = true;
    };
  }, [src]);

  const scale = height / SOURCE_H;
  const markWidth = (ICON_RIGHT - ICON_LEFT) * scale;

  return (
    <div
      className={className}
      style={{
        height,
        width: markWidth,
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
        ...style,
      }}
    >
      {src && (
        <img
          src={src}
          alt=""
          style={{
            position: "absolute",
            left: -ICON_LEFT * scale,
            top: -height * INK_CENTROID_OFFSET,
            height,
            width: SOURCE_W * scale,
            maxWidth: "none",
          }}
        />
      )}
    </div>
  );
}
