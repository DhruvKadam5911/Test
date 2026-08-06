import React, { useState } from 'react';
import type { Video, WatchMode } from '../types';
import { HERO_ORIGINAL, LIVE_NOW_VIDEOS, TRENDING_VIDEOS, CONTINUE_WATCHING_VIDEOS } from '../data/mockData';
import { VideoPlayer } from '../components/VideoPlayer';
import { LiveChat } from '../components/LiveChat';
import { VideoCard } from '../components/VideoCard';
import { OnionRingsIcon } from '../components/OnionRingsIcon';
import { 
  Heart, 
  Share2, 
  Bookmark, 
  CheckCircle2, 
  UserPlus, 
  UserCheck, 
  Eye, 
  Radio, 
  Film
} from 'lucide-react';

interface WatchPageProps {
  currentVideo?: Video;
  onSelectVideo: (video: Video) => void;
}

export const WatchPage: React.FC<WatchPageProps> = ({ 
  currentVideo = HERO_ORIGINAL,
  onSelectVideo 
}) => {
  const [watchMode, setWatchMode] = useState<WatchMode>(currentVideo.isLive ? 'live' : 'vod');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(142000);
  const [isSaved, setIsSaved] = useState(false);

  const activeVideo = watchMode === 'live' ? LIVE_NOW_VIDEOS[0] : currentVideo;
  const creator = activeVideo.creator;
  const moreFromCreator = TRENDING_VIDEOS.filter(v => v.id !== activeVideo.id);

  const handleLikeToggle = () => {
    if (isLiked) {
      setLikeCount(prev => prev - 1);
    } else {
      setLikeCount(prev => prev + 1);
    }
    setIsLiked(!isLiked);
  };

  return (
    <div className="min-h-screen pb-16 bg-[#0A0A0B] text-[#F2EFEA]">
      
      {/* Top Banner Mode Toggle Bar */}
      <div className="bg-[#161418] border-b border-[#2A262E] py-2.5 px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <OnionRingsIcon size={18} className="text-[#C1443B]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#948E96]">
            Player Mode:
          </span>
        </div>

        {/* Mode Switcher Buttons */}
        <div className="flex items-center bg-[#0A0A0B] p-1 rounded-md border border-[#2A262E]">
          <button
            onClick={() => setWatchMode('live')}
            className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
              watchMode === 'live' 
                ? 'bg-[#C1443B] text-white shadow' 
                : 'text-[#948E96] hover:text-[#F2EFEA]'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Live Stream</span>
          </button>

          <button
            onClick={() => setWatchMode('vod')}
            className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
              watchMode === 'vod' 
                ? 'bg-[#1D1A20] text-[#F2EFEA] shadow border border-[#2A262E]' 
                : 'text-[#948E96] hover:text-[#F2EFEA]'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>VOD Video</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Grid Layout: Video Player + Right Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Left Column (Player + Metadata) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* 16:9 Video Player Component */}
            <VideoPlayer video={activeVideo} isLive={watchMode === 'live'} />

            {/* Video Meta Info */}
            <div className="space-y-4">
              
              {/* Title */}
              <h1 className="text-xl sm:text-2xl font-bold text-[#F2EFEA] tracking-tight">
                {activeVideo.title}
              </h1>

              {/* Creator Info Strip & Actions */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2A262E]/60">
                
                {/* Creator Avatar & Name */}
                <div className="flex items-center gap-3">
                  <img 
                    src={creator.avatar} 
                    alt={creator.name}
                    className="w-11 h-11 rounded-full object-cover border border-[#2A262E]"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-sm sm:text-base text-[#F2EFEA]">
                        {creator.name}
                      </h3>
                      {creator.verified && <CheckCircle2 className="w-4 h-4 text-[#C1443B]" />}
                    </div>
                    <p className="text-xs text-[#948E96]">
                      {creator.followers} followers
                    </p>
                  </div>

                  {/* Follow Button */}
                  <button
                    onClick={() => setIsFollowing(!isFollowing)}
                    className={`ml-3 px-4 py-1.5 rounded-md font-medium text-xs flex items-center gap-1.5 transition-all ${
                      isFollowing
                        ? 'bg-[#161418] border border-[#2A262E] text-[#948E96]'
                        : 'bg-[#C1443B] hover:bg-[#D64D43] text-white shadow'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5 text-[#C1443B]" />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Follow</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Right Actions: Likes, Share, Save */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleLikeToggle}
                    className={`px-3.5 py-2 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      isLiked 
                        ? 'bg-[#C1443B]/10 border-[#C1443B] text-[#C1443B]' 
                        : 'bg-[#161418] border-[#2A262E] text-[#F2EFEA] hover:border-[#3D3843]'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                    <span>{likeCount.toLocaleString()}</span>
                  </button>

                  <button
                    onClick={() => setIsSaved(!isSaved)}
                    className={`p-2 rounded-md border text-xs flex items-center gap-1.5 transition-colors ${
                      isSaved 
                        ? 'bg-[#D9A441]/10 border-[#D9A441] text-[#D9A441]' 
                        : 'bg-[#161418] border-[#2A262E] text-[#948E96] hover:text-[#F2EFEA]'
                    }`}
                    title="Bookmark to My List"
                  >
                    <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
                  </button>

                  <button
                    onClick={() => alert('Stream URL copied to clipboard')}
                    className="p-2 rounded-md bg-[#161418] border border-[#2A262E] text-[#948E96] hover:text-[#F2EFEA] text-xs transition-colors"
                    title="Share stream"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>

              </div>

              {/* Description Box */}
              <div className="bg-[#161418] border border-[#2A262E]/60 rounded-md p-4 space-y-2 text-xs text-[#948E96]">
                <div className="flex items-center gap-3 text-[#F2EFEA] font-medium">
                  {watchMode === 'live' ? (
                    <span className="flex items-center gap-1 text-[#C1443B]">
                      <Eye className="w-3.5 h-3.5" /> {activeVideo.viewersCount} watching live
                    </span>
                  ) : (
                    <span>{activeVideo.views} • {activeVideo.publishedAt}</span>
                  )}
                  <span className="text-[#2A262E]">|</span>
                  <span className="text-[#D9A441]">{activeVideo.category}</span>
                </div>

                <p className="leading-relaxed text-[#F2EFEA]/80">
                  {activeVideo.description}
                </p>

                {activeVideo.tags && (
                  <div className="pt-2 flex flex-wrap gap-2">
                    {activeVideo.tags.map(t => (
                      <span key={t} className="px-2 py-0.5 rounded bg-[#1D1A20] border border-[#2A262E] text-[11px] text-[#948E96]">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>

          {/* Right Sidebar Column (Chat Panel if Live, Up Next Queue if VOD) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {watchMode === 'live' ? (
              <div className="h-[580px]">
                <LiveChat />
              </div>
            ) : (
              <div className="bg-[#161418] border border-[#2A262E] rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-[#2A262E] pb-3">
                  <div className="flex items-center gap-2">
                    <OnionRingsIcon size={16} className="text-[#C1443B]" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F2EFEA]">
                      Up Next
                    </h3>
                  </div>
                  <span className="text-[11px] text-[#948E96]">Autoplay ON</span>
                </div>

                <div className="space-y-3">
                  {CONTINUE_WATCHING_VIDEOS.map((v) => (
                    <div 
                      key={v.id}
                      onClick={() => onSelectVideo(v)}
                      className="flex gap-3 p-2 rounded-md hover:bg-[#1D1A20] cursor-pointer transition-colors group"
                    >
                      <div className="relative w-28 aspect-video rounded overflow-hidden bg-[#0A0A0B] shrink-0">
                        <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                        <span className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.2 rounded text-[10px] text-white">
                          {v.duration}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-medium text-[#F2EFEA] group-hover:text-[#C1443B] transition-colors truncate">
                          {v.title}
                        </h4>
                        <p className="text-[11px] text-[#948E96] mt-0.5 truncate">{v.creator.name}</p>
                        <span className="text-[10px] text-[#948E96]/70 block mt-1">{v.views}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>

        {/* Row Below Player: "More from this creator" */}
        <section className="mt-16 pt-8 border-t border-[#2A262E]/60">
          <div className="flex items-center gap-2.5 mb-6">
            <OnionRingsIcon size={20} className="text-[#C1443B]" />
            <h2 className="text-xl font-semibold text-[#F2EFEA] tracking-tight">
              More from {creator.name}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {moreFromCreator.slice(0, 3).map((video) => (
              <VideoCard 
                key={video.id} 
                video={video} 
                onSelect={onSelectVideo} 
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
};
