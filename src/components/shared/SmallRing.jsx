import React from 'react';
import { colors } from '../../theme';

export function SmallRing({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke={colors.accentLight} strokeWidth="1.5" strokeOpacity="0.9" />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke={colors.accentLight} strokeWidth="1.5" strokeOpacity="0.55" />
    </svg>
  );
}

export default SmallRing;
