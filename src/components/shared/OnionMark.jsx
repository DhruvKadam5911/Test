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

export default function OnionMark({ height = 96, className = "", style }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = "/logo.png";
    img.onload = () => {
      if (cancelled) return;

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // White page background → transparent.
        if (r > 220 && g > 220 && b > 220) {
          data[i + 3] = 0;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      if (!cancelled) setSrc(canvas.toDataURL("image/png"));
    };

    return () => {
      cancelled = true;
    };
  }, []);

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
            top: 0,
            height,
            width: SOURCE_W * scale,
            maxWidth: "none",
          }}
        />
      )}
    </div>
  );
}
