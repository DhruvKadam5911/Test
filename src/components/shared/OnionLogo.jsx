import React, { useState, useEffect } from 'react';

export function OnionLogo({ height = 90, className = "" }) {
  const [exactLogo, setExactLogo] = useState('/logo.png');

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = '/logo.png';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw the exact full logo image (bulb mark + ONION wordmark)
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Convert white background pixels to transparent, and brighten dark purple wordmark text for dark background
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Background pixels -> transparent
        if (r > 220 && g > 220 && b > 220) {
          data[i + 3] = 0;
        } 
        // Dark purple ONION wordmark text -> brighten to soft white (#F3F0F5) for dark bg contrast
        else if (r < 95 && g < 40 && b < 105) {
          data[i] = 243;
          data[i + 1] = 240;
          data[i + 2] = 245;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      setExactLogo(canvas.toDataURL('image/png'));
    };
  }, []);

  return (
    <div className={`flex items-center ${className}`}>
      {/* Render exact brand logo image (bulb mark + ONION wordmark) */}
      <img 
        src={exactLogo} 
        alt="ONION" 
        style={{ height: height, width: 'auto', objectFit: 'contain' }}
        className="shrink-0 transition-all duration-200"
      />
    </div>
  );
}

export default OnionLogo;
