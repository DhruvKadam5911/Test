import React from 'react';
import type { Video } from '../types';
import { Play, Eye, Clock, CheckCircle2 } from 'lucide-react';

interface VideoCardProps {
  video: Video;
  size?: 'normal' | 'large';
  onSelect: (video: Video) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({ 
  video, 
  size = 'normal',
  onSelect 
}) => {
  const isLarge = size === 'large';

  return (
    <div 
      onClick={() => onSelect(video)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(video);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Watch ${video.title}`}
      className={`group relative rounded-md bg-[#161418] border border-[#2A262E]/60 overflow-hidden cursor-pointer onion-card-hover focus-visible:ring-2 focus-visible:ring-[#C1443B] focus-visible:outline-none flex flex-col ${
        isLarge ? 'min-w-[280px] sm:min-w-[340px]' : 'min-w-[220px] sm:min-w-[260px]'
      }`}
    >
      {/* Thumbnail Container */}
      <div className={`relative w-full overflow-hidden bg-[#1D1A20] ${isLarge ? 'aspect-[16/10]' : 'aspect-video'}`}>
        <img 
          src={video.thumbnail} 
          alt={video.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />

        {/* Dark subtle Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B]/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

        {/* Hover Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/40 backdrop-blur-[2px]">
          <div className="w-12 h-12 rounded-full bg-[#C1443B] flex items-center justify-center text-white shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Top Badges: LIVE pill or ONION ORIGINAL tag */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-2 z-10">
          {video.isLive && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wider bg-[#C1443B] text-white shadow-md">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          )}

          {video.isOriginal && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide bg-[#D9A441] text-[#0A0A0B] uppercase">
              Original
            </span>
          )}
        </div>

        {/* Bottom Badges: Viewers Count or Duration */}
        <div className="absolute bottom-2.5 right-2.5 z-10">
          {video.isLive ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/75 backdrop-blur-md text-[11px] text-[#F2EFEA] font-medium">
              <Eye className="w-3 h-3 text-[#C1443B]" />
              {video.viewersCount || video.views}
            </span>
          ) : (
            video.duration && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-[11px] text-[#F2EFEA] font-medium tracking-tight">
                <Clock className="w-3 h-3 text-[#948E96]" />
                {video.duration}
              </span>
            )
          )}
        </div>

        {/* Continue Watching Progress Bar */}
        {typeof video.progress === 'number' && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#2A262E]">
            <div 
              className="h-full bg-[#C1443B] transition-all"
              style={{ width: `${video.progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Card Info */}
      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2 bg-[#161418]">
        <div>
          <h3 className="font-medium text-sm sm:text-base text-[#F2EFEA] line-clamp-1 group-hover:text-[#C1443B] transition-colors">
            {video.title}
          </h3>
          <p className="text-xs text-[#948E96] line-clamp-1 mt-1 font-normal">
            {video.description}
          </p>
        </div>

        {/* Creator Info Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-[#2A262E]/40 text-xs text-[#948E96]">
          <div className="flex items-center gap-2 min-w-0">
            <img 
              src={video.creator.avatar} 
              alt={video.creator.name}
              className="w-5 h-5 rounded-full object-cover shrink-0"
            />
            <span className="truncate font-medium text-[#F2EFEA]/80 text-[12px] group-hover:text-[#F2EFEA]">
              {video.creator.name}
            </span>
            {video.creator.verified && (
              <CheckCircle2 className="w-3 h-3 text-[#C1443B] shrink-0" />
            )}
          </div>
          <span className="text-[11px] text-[#948E96]/70 shrink-0">
            {video.category}
          </span>
        </div>
      </div>
    </div>
  );
};
