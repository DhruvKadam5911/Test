import React from 'react';
import { colors } from '../../theme';

export function RingMotif({ size = 420, opacity = 0.5, style }) {
  const rings = [1, 0.76, 0.54, 0.34, 0.16];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ opacity, pointerEvents: "none", ...style }}>
      {rings.map((r, i) => (
        <circle 
          key={i} 
          cx="50" 
          cy="50" 
          r={r * 48} 
          fill="none"
          stroke={i % 2 === 0 ? colors.accent : colors.accentLight}
          strokeWidth={i === rings.length - 1 ? 3 : 0.6}
          strokeOpacity={i === rings.length - 1 ? 0.9 : 0.4} 
        />
      ))}
    </svg>
  );
}

export default RingMotif;
