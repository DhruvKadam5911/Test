import React from 'react';
import { OnionRingsIcon } from './OnionRingsIcon';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#0A0A0B] border-t border-[#2A262E]/60 py-12 mt-20 text-xs text-[#948E96]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* Left: Brand logo & Copyright */}
        <div className="flex items-center gap-3">
          <OnionRingsIcon size={20} className="text-[#C1443B]" />
          <span className="font-display font-medium text-lg text-[#F2EFEA] tracking-tight">onion</span>
          <span className="text-[#2A262E]">|</span>
          <p>© {new Date().getFullYear()} Onion Media Inc. All rights reserved.</p>
        </div>

        {/* Right: Footer Navigation Links */}
        <nav className="flex flex-wrap items-center gap-6">
          <a 
            href="#about" 
            onClick={(e) => e.preventDefault()} 
            className="hover:text-[#F2EFEA] transition-colors focus-visible:ring-1 focus-visible:ring-[#C1443B] rounded px-1"
          >
            About
          </a>
          <a 
            href="#creators" 
            onClick={(e) => e.preventDefault()} 
            className="hover:text-[#F2EFEA] transition-colors focus-visible:ring-1 focus-visible:ring-[#C1443B] rounded px-1"
          >
            Creators
          </a>
          <a 
            href="#help" 
            onClick={(e) => e.preventDefault()} 
            className="hover:text-[#F2EFEA] transition-colors focus-visible:ring-1 focus-visible:ring-[#C1443B] rounded px-1"
          >
            Help & Safety
          </a>
          <a 
            href="#terms" 
            onClick={(e) => e.preventDefault()} 
            className="hover:text-[#F2EFEA] transition-colors focus-visible:ring-1 focus-visible:ring-[#C1443B] rounded px-1"
          >
            Terms of Service
          </a>
          <a 
            href="#privacy" 
            onClick={(e) => e.preventDefault()} 
            className="hover:text-[#F2EFEA] transition-colors focus-visible:ring-1 focus-visible:ring-[#C1443B] rounded px-1"
          >
            Privacy Policy
          </a>
        </nav>

      </div>
    </footer>
  );
};
