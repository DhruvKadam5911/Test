import React from 'react';

interface OnionRingsIconProps {
  className?: string;
  size?: number;
}

export const OnionRingsIcon: React.FC<OnionRingsIconProps> = ({ 
  className = "text-[#C1443B]", 
  size = 20 
}) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Outer ring */}
      <circle 
        cx="12" 
        cy="12" 
        r="9" 
        stroke="currentColor" 
        strokeWidth="1.75" 
        strokeDasharray="28 4" 
        opacity="0.9"
      />
      {/* Inner ring */}
      <circle 
        cx="12" 
        cy="12" 
        r="4.5" 
        stroke="currentColor" 
        strokeWidth="1.75" 
      />
      {/* Center core dot */}
      <circle 
        cx="12" 
        cy="12" 
        r="1.75" 
        fill="currentColor" 
      />
    </svg>
  );
};
