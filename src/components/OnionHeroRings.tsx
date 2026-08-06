import React from 'react';

interface OnionHeroRingsProps {
  className?: string;
  opacity?: number;
}

export const OnionHeroRings: React.FC<OnionHeroRingsProps> = ({ 
  className = "absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 pointer-events-none",
  opacity = 0.15
}) => {
  return (
    <div className={`overflow-hidden pointer-events-none ${className}`} style={{ opacity }}>
      <svg 
        width="680" 
        height="680" 
        viewBox="0 0 680 680" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="animate-spin-slow origin-center"
      >
        <circle cx="340" cy="340" r="330" stroke="#C1443B" strokeWidth="1.5" strokeDasharray="16 8" />
        <circle cx="340" cy="340" r="270" stroke="#F2EFEA" strokeWidth="1" strokeDasharray="12 6" />
        <circle cx="340" cy="340" r="210" stroke="#C1443B" strokeWidth="1.5" />
        <circle cx="340" cy="340" r="160" stroke="#D9A441" strokeWidth="1" strokeDasharray="8 4" />
        <circle cx="340" cy="340" r="110" stroke="#F2EFEA" strokeWidth="1.5" />
        <circle cx="340" cy="340" r="65" stroke="#C1443B" strokeWidth="2" />
        <circle cx="340" cy="340" r="25" fill="#C1443B" />
      </svg>
    </div>
  );
};
