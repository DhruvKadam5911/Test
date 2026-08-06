import React, { useState, useRef } from 'react';
import type { Video } from '../types';
import { HERO_ORIGINAL, LIVE_NOW_VIDEOS, CONTINUE_WATCHING_VIDEOS, TRENDING_VIDEOS, CATEGORIES } from '../data/mockData';
import { OnionRingsIcon } from '../components/OnionRingsIcon';
import { OnionHeroRings } from '../components/OnionHeroRings';
import { VideoCard } from '../components/VideoCard';
import { Play, Plus, Check, ChevronLeft, ChevronRight, Sparkles, Flame } from 'lucide-react';

interface HomePageProps {
  onSelectVideo: (video: Video) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onSelectVideo }) => {
  const [selectedCategory, setSelectedCategory] = useState('All Content');
  const [inMyList, setInMyList] = useState(false);

  // Row horizontal scrolling refs
  const liveRowRef = useRef<HTMLDivElement | null>(null);
  const continueRowRef = useRef<HTMLDivElement | null>(null);
  const trendingRowRef = useRef<HTMLDivElement | null>(null);

  const scrollRow = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = direction === 'left' ? -400 : 400;
      ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen pb-16 bg-[#0A0A0B] text-[#F2EFEA]">
      
      {/* HERO SECTION: Onion Original */}
      <section className="relative w-full min-h-[520px] sm:min-h-[600px] flex items-center justify-center overflow-hidden border-b border-[#2A262E]/60 bg-gradient-to-b from-[#161418] via-[#0A0A0B] to-[#0A0A0B]">
        
        {/* Background Image with Vignette */}
        <div className="absolute inset-0 z-0">
          <img 
            src={HERO_ORIGINAL.thumbnail} 
            alt={HERO_ORIGINAL.title}
            className="w-full h-full object-cover opacity-35 filter brightness-90 scale-105 transition-transform duration-1000"
          />
          {/* Radial & linear dark gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B] via-[#0A0A0B]/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0B] via-[#0A0A0B]/80 to-transparent" />
        </div>

        {/* Signature Concentric Ring Graphic Motif */}
        <OnionHeroRings opacity={0.18} className="absolute -right-20 top-1/2 -translate-y-1/2 pointer-events-none hidden lg:block" />

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full flex flex-col justify-end min-h-[500px]">
          
          {/* Original Pill Badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider bg-[#D9A441]/20 text-[#D9A441] border border-[#D9A441]/40 uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              Onion Original Series
            </span>
            <span className="text-xs text-[#948E96] font-mono">SEASON 1 NOW STREAMING</span>
          </div>

          {/* Hero Headline (Fraunces Font) */}
          <h1 className="font-display text-4xl sm:text-6xl md:text-7xl font-semibold tracking-tight text-[#F2EFEA] max-w-3xl leading-[1.08]">
            {HERO_ORIGINAL.title}
          </h1>

          {/* Description */}
          <p className="mt-4 text-sm sm:text-base text-[#948E96] max-w-2xl font-normal leading-relaxed line-clamp-3">
            {HERO_ORIGINAL.description}
          </p>

          {/* Metadata tags */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[#948E96]">
            <span className="px-2 py-0.5 rounded bg-[#161418] border border-[#2A262E] text-[#F2EFEA] font-medium">4K Ultra HD</span>
            <span className="px-2 py-0.5 rounded bg-[#161418] border border-[#2A262E] text-[#F2EFEA] font-medium">5.1 Audio</span>
            <span>{HERO_ORIGINAL.duration}</span>
            <span>•</span>
            <span>{HERO_ORIGINAL.category}</span>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              onClick={() => onSelectVideo(HERO_ORIGINAL)}
              className="px-6 py-3 rounded-md bg-[#C1443B] hover:bg-[#D64D43] text-white font-semibold text-sm flex items-center gap-2.5 transition-all shadow-xl focus-visible:ring-2 focus-visible:ring-[#C1443B]"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Watch Now</span>
            </button>

            <button
              onClick={() => setInMyList(!inMyList)}
              className="px-6 py-3 rounded-md bg-[#161418]/90 hover:bg-[#1D1A20] border border-[#2A262E] text-[#F2EFEA] font-medium text-sm flex items-center gap-2 transition-all backdrop-blur focus-visible:ring-2 focus-visible:ring-[#C1443B]"
            >
              {inMyList ? (
                <>
                  <Check className="w-4 h-4 text-[#C1443B]" />
                  <span>In My List</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-[#948E96]" />
                  <span>My List</span>
                </>
              )}
            </button>
          </div>

        </div>
      </section>

      {/* CATEGORY FILTER TABS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat 
                  ? 'bg-[#C1443B] text-white font-semibold shadow' 
                  : 'bg-[#161418] text-[#948E96] hover:text-[#F2EFEA] border border-[#2A262E]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* MAIN CONTENT ROWS */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 mt-10">
        
        {/* ROW 1: LIVE NOW */}
        <section className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <OnionRingsIcon size={20} className="text-[#C1443B]" />
              <h2 className="text-xl font-semibold text-[#F2EFEA] tracking-tight flex items-center gap-2">
                Live Now
                <span className="w-2 h-2 rounded-full bg-[#C1443B] animate-pulse" />
              </h2>
            </div>

            {/* Scroll Navigation Buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <button 
                onClick={() => scrollRow(liveRowRef, 'left')}
                className="p-1.5 rounded bg-[#161418] hover:bg-[#1D1A20] text-[#948E96] hover:text-[#F2EFEA] border border-[#2A262E] transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => scrollRow(liveRowRef, 'right')}
                className="p-1.5 rounded bg-[#161418] hover:bg-[#1D1A20] text-[#948E96] hover:text-[#F2EFEA] border border-[#2A262E] transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div 
            ref={liveRowRef}
            className="flex items-stretch gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
          >
            {LIVE_NOW_VIDEOS.map((video) => (
              <VideoCard 
                key={video.id} 
                video={video} 
                onSelect={onSelectVideo} 
              />
            ))}
          </div>
        </section>

        {/* ROW 2: CONTINUE WATCHING */}
        <section className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <OnionRingsIcon size={20} className="text-[#C1443B]" />
              <h2 className="text-xl font-semibold text-[#F2EFEA] tracking-tight">
                Continue Watching
              </h2>
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <button 
                onClick={() => scrollRow(continueRowRef, 'left')}
                className="p-1.5 rounded bg-[#161418] hover:bg-[#1D1A20] text-[#948E96] hover:text-[#F2EFEA] border border-[#2A262E] transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => scrollRow(continueRowRef, 'right')}
                className="p-1.5 rounded bg-[#161418] hover:bg-[#1D1A20] text-[#948E96] hover:text-[#F2EFEA] border border-[#2A262E] transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div 
            ref={continueRowRef}
            className="flex items-stretch gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
          >
            {CONTINUE_WATCHING_VIDEOS.map((video) => (
              <VideoCard 
                key={video.id} 
                video={video} 
                onSelect={onSelectVideo} 
              />
            ))}
          </div>
        </section>

        {/* ROW 3: TRENDING ON ONION (LARGER CARDS) */}
        <section className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <OnionRingsIcon size={20} className="text-[#C1443B]" />
              <h2 className="text-xl font-semibold text-[#F2EFEA] tracking-tight flex items-center gap-2">
                Trending on Onion
                <Flame className="w-4 h-4 text-[#D9A441]" />
              </h2>
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <button 
                onClick={() => scrollRow(trendingRowRef, 'left')}
                className="p-1.5 rounded bg-[#161418] hover:bg-[#1D1A20] text-[#948E96] hover:text-[#F2EFEA] border border-[#2A262E] transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => scrollRow(trendingRowRef, 'right')}
                className="p-1.5 rounded bg-[#161418] hover:bg-[#1D1A20] text-[#948E96] hover:text-[#F2EFEA] border border-[#2A262E] transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div 
            ref={trendingRowRef}
            className="flex items-stretch gap-5 overflow-x-auto no-scrollbar py-2 scroll-smooth"
          >
            {TRENDING_VIDEOS.map((video) => (
              <VideoCard 
                key={video.id} 
                video={video} 
                size="large"
                onSelect={onSelectVideo} 
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
};
